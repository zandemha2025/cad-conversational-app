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
        # Gemini only accepts "user" and "model" roles.
        # DB stores "user"/"assistant"; guard against "system" or any other value.
        contents = []
        for h in history[-20:]:
            raw_role = h.get("role", "user")
            if raw_role == "assistant":
                role = "model"
                text = h["content"]
            elif raw_role == "user":
                role = "user"
                text = h["content"]
            elif raw_role == "system":
                role = "user"
                text = f"[System]: {h['content']}"
            else:
                role = "user"
                text = h["content"]
            contents.append({"role": role, "parts": [{"text": text}]})
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

    # ── Variation descriptions (Pro) ─────────────────────────────────────────
    async def generate_variation_descriptions(
        self,
        prompt: str,
        num_variations: int,
        variation_parameters: list[str],
    ) -> list[dict]:
        """
        Given a fixture design prompt, return num_variations distinct descriptions
        each varying the specified parameters. Returns list of dicts:
          { description, varied_parameter, varied_value, label }
        """
        params_str = ", ".join(variation_parameters) if variation_parameters else \
            "wall_thickness, hole_pattern, base_size, clamp_type"

        prompt_text = (
            f"You are a CAD fixture design expert. Generate {num_variations} distinct fixture design "
            f"variations for the following request:\n\nPrompt: \"{prompt}\"\n\n"
            f"Parameters to vary across the {num_variations} designs: {params_str}\n\n"
            "Return a JSON array (no markdown fences) of exactly "
            f"{num_variations} objects. Each object must have:\n"
            '- "description": a complete, self-contained prompt for a text-to-CAD tool (2-3 sentences, '
            'metric units, precise geometry — e.g., wall thickness, hole diameters, base plate dimensions)\n'
            '- "varied_parameter": the primary parameter being changed (e.g., "wall_thickness")\n'
            '- "varied_value": the specific value for this variation (e.g., "25mm")\n'
            '- "label": short human label (e.g., "Heavy Wall", "Compact Base", "4-Hole Pattern")\n\n'
            "Make each variation meaningfully distinct. Use realistic manufacturing dimensions. "
            "Ensure descriptions are optimized for Zoo.dev text-to-CAD generation."
        )

        if not settings.GEMINI_API_KEY:
            return _stub_variation_descriptions(prompt, num_variations)

        model = self._get_pro()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt_text))
            raw = resp.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
            if isinstance(data, list) and len(data) == num_variations:
                return data
            # If Gemini returned wrong count, pad/trim
            while len(data) < num_variations:
                data.append(_stub_variation_descriptions(prompt, 1)[0])
            return data[:num_variations]
        except Exception as e:
            log.error("generate_variation_descriptions error: %s", e)
            return _stub_variation_descriptions(prompt, num_variations)

    # ── Standard component suggestions (Flash) ────────────────────────────────
    async def suggest_components(self, user_prompt: str, catalog_hints: list[str]) -> list[dict]:
        """
        Suggest standard catalog components relevant to the fixture design.
        Returns a list of dicts: [{id, reason}, ...] (up to 3 items).
        """
        if not settings.GEMINI_API_KEY:
            return []

        catalog_text = "\n".join(catalog_hints[:50])
        prompt = (
            f"You are helping select standard tooling components for a manufacturing fixture.\n"
            f"Fixture request: {user_prompt!r}\n\n"
            f"Available catalog components:\n{catalog_text}\n\n"
            "Select up to 3 components from the catalog that are most relevant to this fixture design. "
            "Return a JSON array (no markdown fences) of objects with fields: "
            '"id" (the component id from the catalog) and "reason" (one sentence why it fits). '
            "Only include components that are genuinely applicable. "
            "If none are relevant, return an empty array []."
        )

        model = self._get_flash()
        loop = asyncio.get_event_loop()
        try:
            resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
            raw = resp.text.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
            if isinstance(data, list):
                return data[:3]
        except Exception as e:
            log.error("suggest_components error: %s", e)
        return []

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


def _stub_variation_descriptions(prompt: str, num_variations: int) -> list[dict]:
    """Fallback variation descriptions when Gemini is unavailable."""
    variations = [
        {"label": "Standard", "varied_parameter": "wall_thickness", "varied_value": "15mm",
         "description": f"{prompt}. Standard configuration with 15mm wall thickness and 50mm bolt circle diameter."},
        {"label": "Heavy Wall", "varied_parameter": "wall_thickness", "varied_value": "25mm",
         "description": f"{prompt}. Heavy-duty version with 25mm thick walls for maximum rigidity on hard materials."},
        {"label": "Compact", "varied_parameter": "base_size", "varied_value": "reduced 20%",
         "description": f"{prompt}. Compact footprint with base dimensions reduced 20%, optimized for small VMC tables."},
        {"label": "4-Hole Pattern", "varied_parameter": "hole_pattern", "varied_value": "4x90° BCD 60mm",
         "description": f"{prompt}. 4-hole pattern on 60mm bolt circle diameter, 90° spacing, M8 clearance holes."},
        {"label": "6-Hole Pattern", "varied_parameter": "hole_pattern", "varied_value": "6x60° BCD 70mm",
         "description": f"{prompt}. 6-hole pattern on 70mm bolt circle diameter, 60° spacing for balanced clamping."},
        {"label": "Lightweight", "varied_parameter": "wall_thickness", "varied_value": "8mm",
         "description": f"{prompt}. Lightweight version with 8mm walls and pocket relief features, suited for aluminum only."},
        {"label": "Wide Base", "varied_parameter": "base_size", "varied_value": "enlarged 30%",
         "description": f"{prompt}. Wide-stance base enlarged 30% for improved stability on long overhang operations."},
        {"label": "High Clamp", "varied_parameter": "clamp_type", "varied_value": "vertical toggle",
         "description": f"{prompt}. Vertical toggle clamp variant with 300N clamping force, 25mm stroke for tall parts."},
        {"label": "Side Clamp", "varied_parameter": "clamp_type", "varied_value": "horizontal toggle",
         "description": f"{prompt}. Horizontal side-entry clamp for unobstructed top access during machining operations."},
        {"label": "Modular", "varied_parameter": "base_size", "varied_value": "Siegmund 28mm grid",
         "description": f"{prompt}. Modular design on Siegmund 28mm grid plate, 4x M12 T-nuts, compatible with 5-axis pallets."},
    ]
    return variations[:num_variations]


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
