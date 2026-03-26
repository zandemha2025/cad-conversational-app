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


def _fill_template(template: str, **kwargs) -> str:
    """Replace {key} placeholders without using str.format() so curly braces
    in KCL/JSON example code are not misinterpreted as format fields."""
    for key, value in kwargs.items():
        template = template.replace(f"{{{key}}}", str(value))
    return template


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
            "You are an expert manufacturing fixture and tooling engineer inside ScaleCAD — "
            "a conversational CAD platform. Your specialty is:\n"
            "- CNC machining fixtures: work holding, 3-2-1 locating, datum selection, clamping strategy\n"
            "- Drill jigs: drill bushing sizing (fixed/renewable/liner), leaf/box/plate jig types, "
            "indexing, chip clearance\n"
            "- Assembly jigs: part nesting, tooling balls, shim stacks, CMM datum features\n"
            "- Weld fixtures: distortion control, purge dams, clamp sequencing, thermal expansion\n"
            "- Robotic end effectors (EOAT): gripper design, vacuum cup sizing (Bernoulli vs suction), "
            "force/moment calculations, tool changer interfaces (ISO 9409-1)\n"
            "- GD&T per ASME Y14.5: datum feature selection, position/profile callouts for locating pins, "
            "clamp pads, and bushing seats\n"
            "- Material selection: 6061-T6 and 7075-T6 aluminum for light fixtures, A36/4140 steel for "
            "heavy-duty, D2/A2 tool steel for wearing surfaces, Delrin for soft jaws\n"
            "- Clamping force: Boothroyd-Dewhurst cutting force models, clamp adequacy, toggle clamp "
            "selection (De-Sta-Co, Carr Lane), pneumatic cylinder sizing\n"
            "- Repeatability: dowel pin diameter/tolerance (H7/g6), locating pin types (round/diamond), "
            "RMS stack-up calculations\n\n"
            "Respond concisely and technically. When relevant, cite specific standard callouts, "
            "vendor part numbers, or formulas. Avoid generic advice — give actionable engineering detail.\n"
            f"Current project context: {json.dumps(project_ctx, default=str)}"
        )

        # Build conversation for the API
        # Gemini uses "user"/"model"; DB stores "user"/"assistant"
        contents = []
        for h in history[-20:]:
            role = "model" if h["role"] == "assistant" else h["role"]
            contents.append({"role": role, "parts": [{"text": h["content"]}]})
        contents.append({"role": "user", "parts": [{"text": user_message}]})

        try:
            # system_instruction must be set on the model, not generate_content()
            model = genai.GenerativeModel(
                settings.GEMINI_FLASH_MODEL,
                system_instruction=system_prompt,
            )
            loop = asyncio.get_event_loop()

            def _run_stream():
                return model.generate_content(
                    contents,
                    stream=True,
                )

            stream = await loop.run_in_executor(None, _run_stream)
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            log.error("stream_chat error: %s", e)
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                yield "⚠️ AI rate limit reached — please wait a moment and try again."
            else:
                yield f"Sorry, I encountered an error processing your request."

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
        prompt = _fill_template(
            template,
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
            raw = resp.text.strip()
            # Strip accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            return raw
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
        prompt = _fill_template(
            template,
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

        prompt = _fill_template(
            template,
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

    # ── Zoo.dev prompt distillation (Flash) ──────────────────────────────────
    async def distill_for_zoo(
        self,
        user_prompt: str,
        template_id: str = "generic_fixture",
        part_features: dict | None = None,
    ) -> str:
        """
        Convert any user prompt into a clean, short geometry description
        suitable for Zoo.dev text-to-CAD (<200 chars, pure geometry terms).

        Example:
          in:  "I need a drill jig for Boeing 737 wing panel assembly with M8 bolt pattern"
          out: "aluminum plate 200x150x20mm with 4 M8 through-holes at 45mm spacing"
        """
        bb = (part_features or {}).get("bounding_box", {})
        size_hint = ""
        if bb:
            x = bb.get("x", 0)
            y = bb.get("y", 0)
            z = bb.get("z", 0)
            if x and y:
                size_hint = f" Part bounding box: {x:.0f}x{y:.0f}x{z:.0f}mm."

        system = (
            "You are a CAD geometry translator. Convert the user's fixture design request "
            "into a concise geometry description for a text-to-3D-CAD system. "
            "Rules:\n"
            "- Output ONLY the geometry description, nothing else\n"
            "- Maximum 180 characters\n"
            "- Use pure geometry/manufacturing terms (shapes, dimensions, holes, features)\n"
            "- Include approximate dimensions in mm if inferrable\n"
            "- No business context, no assembly context, no part names\n"
            "- Start with the primary material and base shape\n"
            "- Example output: 'aluminum plate 200x150x20mm with 4 M8 through-holes at 50mm spacing and 2 locating pins'"
        )
        prompt = (
            f"{system}\n\n"
            f"Fixture type: {template_id.replace('_', ' ')}.{size_hint}\n"
            f"User request: {user_prompt}\n\n"
            f"Geometry description:"
        )

        fallback = _default_zoo_prompt(template_id, bb)

        if not settings.GEMINI_API_KEY:
            return fallback

        try:
            model = self._get_flash()
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: model.generate_content(prompt)
            )
            result = resp.text.strip().strip('"').strip("'")
            # Enforce length limit
            if len(result) > 195:
                result = result[:192] + "..."
            if result:
                log.info("distill_for_zoo: '%s' → '%s'", user_prompt[:60], result[:80])
                return result
        except Exception as e:
            log.error("distill_for_zoo error: %s", e)

        return fallback

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
        prompt = _fill_template(
            template,
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


# ── Zoo.dev prompt fallback ───────────────────────────────────────────────────

def _default_zoo_prompt(template_id: str, bb: dict) -> str:
    """Return a safe default Zoo.dev geometry prompt when Gemini distillation fails."""
    w = max(int(bb.get("x", 0)) + 40, 200) if bb else 200
    d = max(int(bb.get("y", 0)) + 40, 150) if bb else 150
    type_map = {
        "drill_jig":      f"aluminum drill jig plate {w}x{d}x20mm with 4 drill bushing holes and 2 locating pins",
        "cnc_fixture":    f"aluminum CNC machining fixture plate {w}x{d}x25mm with 3-2-1 locating pads and clamp slots",
        "weld_fixture":   f"steel welding fixture base plate {w}x{d}x30mm with v-block supports and clamp positions",
        "assembly_jig":   f"aluminum assembly jig plate {w}x{d}x20mm with tooling ball seats and dowel pin holes",
        "inspection_jig": f"aluminum inspection fixture plate {w}x{d}x15mm with datum surface and part nesting pockets",
    }
    return type_map.get(template_id, f"aluminum fixture plate {w}x{d}x20mm with mounting holes and locating features")


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
