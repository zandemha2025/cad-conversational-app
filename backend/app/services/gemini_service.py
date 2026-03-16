"""
Gemini 2.0 service.

Flash  → fast chat, intent classification, DFM explanation
Pro    → KCL code generation, node graph generation, constraint solving
"""
import json
import asyncio
import logging
from pathlib import Path
from typing import AsyncIterator
import google.generativeai as genai
from app.core.config import settings

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

# GENERATION_INTENTS that should be routed to Gemini Pro
PRO_INTENTS = {"fixture_generation", "geometry_modification", "kcl_revision"}


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text()


class GeminiService:
    def __init__(self):
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
        self._flash = None
        self._pro   = None

    def _get_flash(self):
        if not self._flash:
            self._flash = genai.GenerativeModel(settings.GEMINI_FLASH_MODEL)
        return self._flash

    def _get_pro(self):
        if not self._pro:
            self._pro = genai.GenerativeModel(settings.GEMINI_PRO_MODEL)
        return self._pro

    # ── Intent classification ──────────────────────────────────────────────────
    async def classify_intent(self, user_message: str, project_ctx: dict) -> str:
        if not settings.GEMINI_API_KEY:
            return "general_question"
        try:
            system = _load_prompt("intent_classification.txt")
            prompt = f"{system}\n\nMessage: {user_message}"
            model = self._get_flash()
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: model.generate_content(prompt)
            )
            return resp.text.strip().lower()
        except Exception as e:
            log.error("classify_intent error: %s", e)
            return "general_question"

    # ── Streaming chat (Flash) ─────────────────────────────────────────────────
    async def stream_chat(
        self,
        user_message: str,
        history: list[dict],
        project_ctx: dict,
    ) -> AsyncIterator[str]:
        if not settings.GEMINI_API_KEY:
            yield "I'm running in demo mode — Gemini API key not configured."
            return

        system_prompt = (
            "You are a helpful fixture design assistant inside ScaleCAD. "
            "You help mechanical engineers design manufacturing fixtures (jigs, weld fixtures, EOAT, gauges). "
            "Be concise, technical, and practical. "
            f"Current project: {json.dumps(project_ctx, default=str)}"
        )

        # Build conversation for the API
        contents = []
        for h in history[-20:]:
            contents.append({"role": h["role"], "parts": [{"text": h["content"]}]})
        contents.append({"role": "user", "parts": [{"text": user_message}]})

        try:
            model = self._get_flash()
            loop = asyncio.get_event_loop()

            def _run_stream():
                return model.generate_content(
                    contents,
                    system_instruction=system_prompt,
                    stream=True,
                )

            stream = await loop.run_in_executor(None, _run_stream)
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            log.error("stream_chat error: %s", e)
            yield f"Sorry, I encountered an error: {e}"

    # ── KCL code generation (Pro) ──────────────────────────────────────────────
    async def generate_kcl(
        self,
        part_features: dict,
        touchpoints: list[dict],
        environment: dict,
        printer_profile: dict,
        template_id: str,
        user_prompt: str,
    ) -> str:
        template = _load_prompt("kcl_generation.txt")
        prompt = template.format(
            part_features_json=json.dumps(part_features, default=str),
            touchpoints_json=json.dumps(touchpoints, default=str),
            environment_json=json.dumps(environment, default=str),
            printer_profile_json=json.dumps(printer_profile, default=str),
            template_id=template_id,
            user_prompt=user_prompt,
        )

        if not settings.GEMINI_API_KEY:
            log.warning("GEMINI_API_KEY not set — returning stub KCL")
            return _stub_kcl(part_features)

        model = self._get_pro()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(
                None,
                lambda: model.generate_content(prompt)
            )
            return resp.text.strip()
        except Exception as e:
            log.error("generate_kcl error: %s", e)
            return _stub_kcl(part_features)

    # ── Node graph generation (Pro) ────────────────────────────────────────────
    async def generate_node_graph(
        self,
        part_features: dict,
        touchpoints: list[dict],
        environment: dict,
        printer_profile: dict,
        template_id: str,
    ) -> dict:
        template = _load_prompt("node_graph_generation.txt")
        prompt = template.format(
            part_features_json=json.dumps(part_features, default=str),
            touchpoints_json=json.dumps(touchpoints, default=str),
            environment_json=json.dumps(environment, default=str),
            printer_profile_json=json.dumps(printer_profile, default=str),
            template_id=template_id,
        )

        if not settings.GEMINI_API_KEY:
            log.warning("GEMINI_API_KEY not set — returning stub node graph")
            return _stub_node_graph()

        model = self._get_pro()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
            raw = resp.text.strip()
            # Strip any accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(raw)
        except Exception as e:
            log.error("generate_node_graph error: %s", e)
            return _stub_node_graph()

    # ── Proactive analysis (Flash) ────────────────────────────────────────────
    async def generate_proactive_suggestions(
        self,
        part_features: dict,
        touchpoints: list[dict],
        validation_results: list[dict],
        environment: dict,
    ) -> list[str]:
        try:
            template = _load_prompt("proactive_analysis.txt")
        except FileNotFoundError:
            return _fallback_suggestions(part_features, touchpoints)

        prompt = template.format(
            part_features_json=json.dumps(part_features, default=str),
            touchpoints_json=json.dumps(touchpoints, default=str),
            validation_json=json.dumps(validation_results[:5], default=str),
            environment_json=json.dumps(environment, default=str),
        )

        if not settings.GEMINI_API_KEY:
            return _fallback_suggestions(part_features, touchpoints)

        model = self._get_flash()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
            raw = resp.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            suggestions = json.loads(raw)
            if isinstance(suggestions, list):
                return suggestions[:3]
        except Exception as e:
            log.error("generate_proactive_suggestions error: %s", e)
        return _fallback_suggestions(part_features, touchpoints)

    # ── DFM explanation (Flash) ────────────────────────────────────────────────
    async def explain_dfm_issue(
        self,
        process: str,
        issue_title: str,
        issue_detail: str,
        fix_suggestion: str,
        printer_profile: dict,
        part_features: dict,
    ) -> str:
        template = _load_prompt("dfm_analysis.txt")
        prompt = template.format(
            process=process,
            issue_title=issue_title,
            issue_detail=issue_detail,
            fix_suggestion=fix_suggestion,
            printer_profile_json=json.dumps(printer_profile, default=str),
            part_features_json=json.dumps(part_features, default=str),
        )
        if not settings.GEMINI_API_KEY:
            return "Gemini API not configured."
        model = self._get_flash()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
            return resp.text.strip()
        except Exception as e:
            log.error("explain_dfm_issue error: %s", e)
            return str(e)


# ── Fallback proactive suggestions ───────────────────────────────────────────

def _fallback_suggestions(features: dict, touchpoints: list[dict]) -> list[str]:
    suggestions = []
    holes = features.get("detected_holes", [])
    small_holes = [h for h in holes if h.get("diameter_mm", 99) < 10]
    if small_holes:
        d = small_holes[0].get("diameter_mm", 8)
        suggestions.append(f"Small bore detected (⌀{d}mm). Bushing wall <1.5mm — consider upgrading to hardened bushing for longer tool life.")

    locating = [t for t in touchpoints if t.get("type") == "locating"]
    supporting = [t for t in touchpoints if t.get("type") == "support"]
    if len(supporting) < 3:
        suggestions.append(f"3-2-1 locating: only {len(supporting)} support pad(s) defined. Add {3 - len(supporting)} more rest button(s) to fully constrain the primary datum.")

    if not suggestions or len(suggestions) < 3:
        suggestions.append("Consider adding a flatness GD&T callout on the primary datum surface per ASME Y14.5-2018 section 12.4.")

    return suggestions[:3]


# ── Stubs for when Gemini key not configured ───────────────────────────────────

def _stub_kcl(part_features: dict) -> str:
    bb = part_features.get("bounding_box", {"x": 150, "y": 100, "z": 20})
    lx = bb.get("x", 150) + 40
    ly = bb.get("y", 100) + 40
    return f"""// ScaleCAD — stub fixture (Gemini not configured)
const baseLength = {lx}
const baseWidth  = {ly}
const baseHeight = 12
const wallThick  = 4

const base = startSketchOn('XY')
  |> startProfileAt([-baseLength/2, -baseWidth/2], %)
  |> line([baseLength, 0], %)
  |> line([0, baseWidth], %)
  |> line([-baseLength, 0], %)
  |> close(%)
  |> extrude(length=baseHeight, %)
"""


def _stub_node_graph() -> dict:
    return {
        "nodes": [
            {"id": "part_input", "label": "Part Geometry", "category": "input",
             "x": 20, "y": 100, "w": 180, "h": 80, "ai_generated": False,
             "params": [{"name": "step_file", "value": "uploaded.step", "type": "string"}]},
            {"id": "base_plate", "label": "Base Plate", "category": "foundation",
             "x": 240, "y": 100, "w": 180, "h": 80, "ai_generated": True,
             "params": [
                 {"name": "margin_mm", "value": 20, "unit": "mm", "type": "number"},
                 {"name": "thickness_mm", "value": 12, "unit": "mm", "type": "number"},
             ]},
            {"id": "fixture_output", "label": "Fixture Output", "category": "output",
             "x": 1100, "y": 100, "w": 180, "h": 80, "ai_generated": False,
             "params": []},
        ],
        "connections": [
            {"from_node": "part_input", "from_port": "output",
             "to_node": "base_plate", "to_port": "part_features"},
            {"from_node": "base_plate", "from_port": "output",
             "to_node": "fixture_output", "to_port": "input"},
        ],
    }
