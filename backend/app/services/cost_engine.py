"""
Manufacturing cost estimation engine.
Uses Gemini to analyze a fixture design and estimate production costs
based on the user's available machines.
"""
import json
import asyncio
import logging

log = logging.getLogger(__name__)


async def estimate_manufacturing_cost(
    design_description: str,
    dimensions_json: list,
    machines: list,
    gemini_service,
) -> dict:
    """
    Use Gemini to estimate manufacturing cost based on design and available machines.
    Returns structured cost breakdown.
    """
    from app.core.config import settings

    machine_descriptions = "\n".join([
        f"- {m['name']} ({m['machine_type']}): "
        f"{', '.join(m.get('materials_available') or [])}, "
        f"${m.get('hourly_rate', 0)}/hr"
        for m in machines
    ])

    prompt = f"""Analyze this fixture design and provide a manufacturing cost estimate.

Design: {design_description}
Dimensions: {json.dumps(dimensions_json)}

Available machines:
{machine_descriptions}

Respond in JSON:
{{
  "recommended_method": "fdm_printer|cnc_3axis|cnc_5axis|sla_printer|laser_cutter|manual_shop",
  "recommended_machine": "machine name from the list",
  "recommended_material": "specific material",
  "reasoning": "1-2 sentences why this method/machine",
  "material_volume_cm3": number,
  "material_cost_usd": number,
  "machine_time_hours": number,
  "machine_cost_usd": number,
  "hardware_cost_usd": number,
  "total_cost_usd": number,
  "fits_build_volume": true,
  "alternative_methods": [
    {{"method": "...", "machine": "...", "estimated_cost": number, "tradeoff": "..."}}
  ]
}}"""

    if not settings.GEMINI_API_KEY:
        return _stub_estimate(machines)

    try:
        import google.generativeai as genai
        model = genai.GenerativeModel(settings.GEMINI_FLASH_MODEL)
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        raw = resp.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)
    except Exception as e:
        log.error("estimate_manufacturing_cost error: %s", e)
        return _stub_estimate(machines)


def _stub_estimate(machines: list) -> dict:
    machine = machines[0] if machines else {
        "name": "Unknown", "machine_type": "fdm_printer", "hourly_rate": 5
    }
    hourly = float(machine.get("hourly_rate") or 5)
    materials = machine.get("materials_available") or ["Unknown"]
    return {
        "recommended_method": machine.get("machine_type", "fdm_printer"),
        "recommended_machine": machine.get("name", "Unknown"),
        "recommended_material": materials[0],
        "reasoning": "Gemini API not configured — stub estimate based on first available machine.",
        "material_volume_cm3": 50.0,
        "material_cost_usd": 2.50,
        "machine_time_hours": 2.0,
        "machine_cost_usd": round(hourly * 2, 2),
        "hardware_cost_usd": 5.00,
        "total_cost_usd": round(2.50 + hourly * 2 + 5.00, 2),
        "fits_build_volume": True,
        "alternative_methods": [],
    }
