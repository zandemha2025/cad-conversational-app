"""
Direct export download endpoint.
GET /api/projects/{id}/export/{format}  — synchronous export + download

Uses real OCCT solid modeling (via occt_engine) when pythonocc-core is
available; falls back to stub generators otherwise.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, JSONResponse
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
import logging
import json
import math

log = logging.getLogger(__name__)

# Real OCCT engine — gracefully absent if pythonocc-core not installed
try:
    from app.services import occt_engine as _occt
    _OCCT_AVAILABLE = getattr(_occt, "OCCT_ENGINE_AVAILABLE", False)
except Exception:
    _occt = None  # type: ignore[assignment]
    _OCCT_AVAILABLE = False

log.info(
    "occt_engine available — real geometry exports enabled"
    if _OCCT_AVAILABLE
    else "occt_engine not available — exports will use stub generators"
)
router = APIRouter(prefix="/projects", tags=["export"])

SUPPORTED_FORMATS = {"step", "iges", "stl", "dxf"}

MIME_TYPES = {
    "step": "application/step",
    "iges": "application/iges",
    "stl": "model/stl",
    "dxf": "application/dxf",
}


def _generate_stl_from_features(project_name: str, features: list) -> bytes:
    """Generate a minimal ASCII STL from feature bounding box data."""
    lines = [f"solid {project_name.replace(' ', '_')}"]

    if not features:
        # Generate a default 100x100x50mm box
        vertices = [
            ((0,0,0), (100,0,0), (100,100,0)),
            ((0,0,0), (100,100,0), (0,100,0)),
            ((0,0,50), (100,100,50), (100,0,50)),
            ((0,0,50), (0,100,50), (100,100,50)),
            ((0,0,0), (0,0,50), (100,0,50)),
            ((0,0,0), (100,0,50), (100,0,0)),
            ((0,100,0), (100,100,50), (0,100,50)),
            ((0,100,0), (100,100,0), (100,100,50)),
            ((0,0,0), (0,100,50), (0,0,50)),
            ((0,0,0), (0,100,0), (0,100,50)),
            ((100,0,0), (100,0,50), (100,100,50)),
            ((100,0,0), (100,100,50), (100,100,0)),
        ]
        for v0, v1, v2 in vertices:
            # Compute face normal
            ux, uy, uz = v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]
            wx, wy, wz = v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]
            nx, ny, nz = uy*wz-uz*wy, uz*wx-ux*wz, ux*wy-uy*wx
            mag = math.sqrt(nx**2+ny**2+nz**2) or 1
            nx, ny, nz = nx/mag, ny/mag, nz/mag
            lines.append(f"  facet normal {nx:.6f} {ny:.6f} {nz:.6f}")
            lines.append("    outer loop")
            lines.append(f"      vertex {v0[0]} {v0[1]} {v0[2]}")
            lines.append(f"      vertex {v1[0]} {v1[1]} {v1[2]}")
            lines.append(f"      vertex {v2[0]} {v2[1]} {v2[2]}")
            lines.append("    endloop")
            lines.append("  endfacet")
    else:
        # Generate triangles from feature centroids
        for i, feat in enumerate(features[:20]):
            if not isinstance(feat, dict):
                continue
            c = feat.get("centroid", [i*20, 0, 0])
            if not isinstance(c, (list, tuple)) or len(c) < 3:
                c = [i*20, 0, 0]
            r = feat.get("radius", 5) if isinstance(feat.get("radius"), (int, float)) else 5
            cx, cy, cz = float(c[0]), float(c[1]), float(c[2])
            # Simple triangle patch around centroid
            lines.append(f"  facet normal 0.0 0.0 1.0")
            lines.append("    outer loop")
            lines.append(f"      vertex {cx-r:.4f} {cy:.4f} {cz:.4f}")
            lines.append(f"      vertex {cx+r:.4f} {cy:.4f} {cz:.4f}")
            lines.append(f"      vertex {cx:.4f} {cy+r:.4f} {cz:.4f}")
            lines.append("    endloop")
            lines.append("  endfacet")

    lines.append(f"endsolid {project_name.replace(' ', '_')}")
    return "\n".join(lines).encode("utf-8")


def _generate_step_stub(project_name: str, part_number: str) -> bytes:
    """Generate a minimal STEP AP203 stub file."""
    content = f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ScaleCAD Export - {project_name}'),'2;1');
FILE_NAME('{project_name}.step','2024-01-01T00:00:00',('ScaleCAD'),('ScaleCAD'),'ScaleCAD API','ScaleCAD v1.0','');
FILE_SCHEMA(('AP203_CONFIGURATION_CONTROLLED_3D_DESIGN_OF_MECHANICAL_PARTS_AND_ASSEMBLIES_MIM_LF {{ 1 0 10303 403 1 1 4 }}'));
ENDSEC;
DATA;
#1=PRODUCT('{part_number}','{project_name}','ScaleCAD generated part',(#2));
#2=PRODUCT_CONTEXT('',#3,'mechanical');
#3=APPLICATION_CONTEXT('configuration controlled 3D designs of mechanical parts and assemblies');
#4=PRODUCT_DEFINITION_FORMATION('','',#1);
#5=PRODUCT_DEFINITION('design','',#4,#6);
#6=PRODUCT_DEFINITION_CONTEXT('part definition',#3,'design');
ENDSEC;
END-ISO-10303-21;
"""
    return content.encode("utf-8")


def _generate_iges_stub(project_name: str, part_number: str) -> bytes:
    """Generate a minimal IGES 5.3 stub file."""
    # IGES fixed-format 80-column lines
    start = f"ScaleCAD Export - {project_name[:60]:<60}S      1\n"
    global_section = (
        f"1H,,1H;,{len(part_number)+2}H'{part_number}',{len(project_name)+2}H'".ljust(72)
        + "G      1\n"
    )
    terminate = "S      1G      1D      0P      0                                        T      1\n"
    return (start + global_section + terminate).encode("utf-8")


def _generate_dxf_stub(project_name: str, features: list) -> bytes:
    """Generate a minimal DXF R12 file with part outline."""
    lines = [
        "0", "SECTION",
        "2", "HEADER",
        "9", "$ACADVER",
        "1", "AC1009",
        "0", "ENDSEC",
        "0", "SECTION",
        "2", "ENTITIES",
    ]

    if features:
        # Draw circles for holes/features
        for feat in features[:10]:
            if not isinstance(feat, dict):
                continue
            c = feat.get("centroid", [0, 0, 0])
            if not isinstance(c, (list, tuple)) or len(c) < 2:
                continue
            r = feat.get("radius", 5)
            if not isinstance(r, (int, float)):
                r = 5
            lines += [
                "0", "CIRCLE",
                "8", "0",
                "10", str(float(c[0])),
                "20", str(float(c[1])),
                "30", "0.0",
                "40", str(float(r)),
            ]
    else:
        # Draw a default 100x100 rectangle
        for x1, y1, x2, y2 in [(0,0,100,0),(100,0,100,100),(100,100,0,100),(0,100,0,0)]:
            lines += [
                "0", "LINE",
                "8", "0",
                "10", str(x1), "20", str(y1), "30", "0.0",
                "11", str(x2), "21", str(y2), "31", "0.0",
            ]

    lines += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(lines).encode("utf-8")


@router.get("/{project_id}/export/{fmt}")
async def export_direct(
    project_id: str,
    fmt: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Directly export project geometry in the requested format.
    Formats: step, iges, stl, dxf
    Returns a downloadable file.
    """
    fmt = fmt.lower()
    if fmt not in SUPPORTED_FORMATS:
        raise HTTPException(400, f"Unsupported format '{fmt}'. Supported: {', '.join(SUPPORTED_FORMATS)}")

    sb = get_supabase_client()
    proj = sb.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    project = proj.data[0]
    project_name = project.get("name", "ScaleCAD Project")
    part_number = project.get("part_number") or "PART-001"

    # Fetch geometry features
    geom_res = (
        sb.table("part_geometries")
        .select("features_json,step_file_url,gltf_url")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = []
    if geom_res.data and geom_res.data[0].get("features_json"):
        fj = geom_res.data[0]["features_json"]
        if isinstance(fj, dict):
            features = fj.get("faces", []) or fj.get("features", []) or []
        elif isinstance(fj, list):
            features = fj

    # Also check if we have a Zoo.dev/KCL compiled result
    fixture_res = (
        sb.table("fixture_geometries")
        .select("kcl,gltf_url")
        .eq("project_id", project_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )

    # Fetch fixture KCL if available (for Zoo.dev / OCCT conversion)
    fixture_kcl = None
    if fixture_res.data and fixture_res.data[0].get("kcl"):
        fixture_kcl = fixture_res.data[0]["kcl"]

    # Best available GLB URL: prefer fixture GLB (AI-generated), fall back to
    # part GLB (converted from uploaded STEP). Passed to compile_kcl_to_format()
    # so the fast GLB→format path is used instead of re-running text-to-CAD.
    fixture_gltf_url = fixture_res.data[0].get("gltf_url") if fixture_res.data else None
    part_gltf_url = geom_res.data[0].get("gltf_url") if geom_res.data else None
    best_glb_url = fixture_gltf_url or part_gltf_url

    # Full features_json for OCCT engine (keep raw dict/list, not just face list)
    features_json_full = None
    if geom_res.data and geom_res.data[0].get("features_json"):
        features_json_full = geom_res.data[0]["features_json"]

    # Generate the export file
    if fmt == "stl":
        # Prefer real geometry from Zoo.dev if KCL or existing GLB is available
        if fixture_kcl or best_glb_url:
            from app.services.zoo_service import compile_kcl_to_format
            stl_bytes = await compile_kcl_to_format(project_id, fixture_kcl or "", "stl", glb_url=best_glb_url)
            if stl_bytes:
                stl_fn = f"{part_number}_{project_name}.stl".replace(" ", "_")
                return Response(
                    content=stl_bytes,
                    media_type=MIME_TYPES["stl"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{stl_fn}"',
                        "X-Export-Format": "stl",
                        "X-Project-Name": project_name,
                        "X-Source": "zoo_kcl",
                    },
                )
        # Try OCCT engine (real B-rep → STL mesh)
        if _OCCT_AVAILABLE and features_json_full is not None:
            occt_bytes = _occt.features_to_stl_bytes(features_json_full)
            if occt_bytes is None and fixture_kcl:
                occt_bytes = _occt.kcl_to_stl_bytes(fixture_kcl)
            if occt_bytes:
                stl_fn = f"{part_number}_{project_name}.stl".replace(" ", "_")
                return Response(
                    content=occt_bytes,
                    media_type=MIME_TYPES["stl"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{stl_fn}"',
                        "X-Export-Format": "stl",
                        "X-Project-Name": project_name,
                        "X-Source": "occt_engine",
                    },
                )
        content = _generate_stl_from_features(project_name, features)
        mime = MIME_TYPES["stl"]
        filename = f"{part_number}_{project_name}.stl".replace(" ", "_")

    elif fmt == "step":
        # 1. Try Zoo.dev: GLB → STEP (fast) or KCL → STEP (text-to-CAD fallback)
        if fixture_kcl or best_glb_url:
            from app.services.zoo_service import compile_kcl_to_format
            step_bytes = await compile_kcl_to_format(project_id, fixture_kcl or "", "step", glb_url=best_glb_url)
            if step_bytes:
                step_fn = f"{part_number}_{project_name}.step".replace(" ", "_")
                return Response(
                    content=step_bytes,
                    media_type=MIME_TYPES["step"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{step_fn}"',
                        "X-Export-Format": "step",
                        "X-Project-Name": project_name,
                        "X-Source": "zoo_kcl",
                    },
                )
        # 2. OCCT engine: build real solid from features_json → STEP AP214
        if _OCCT_AVAILABLE and features_json_full is not None:
            occt_bytes = _occt.features_to_step_bytes(features_json_full)
            if occt_bytes is None and fixture_kcl:
                occt_bytes = _occt.kcl_to_step_bytes(fixture_kcl)
            if occt_bytes:
                step_fn = f"{part_number}_{project_name}.step".replace(" ", "_")
                return Response(
                    content=occt_bytes,
                    media_type=MIME_TYPES["step"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{step_fn}"',
                        "X-Export-Format": "step",
                        "X-Project-Name": project_name,
                        "X-Source": "occt_engine",
                    },
                )
        # 3. Fall back to original uploaded STEP file
        if geom_res.data and geom_res.data[0].get("step_file_url"):
            step_url = geom_res.data[0]["step_file_url"]
            return JSONResponse({
                "download_url": step_url,
                "format": "step",
                "source": "original_upload",
                "note": "Redirecting to original uploaded STEP file",
            })
        # 4. Last resort: stub
        content = _generate_step_stub(project_name, part_number)
        mime = MIME_TYPES["step"]
        filename = f"{part_number}_{project_name}.step".replace(" ", "_")

    elif fmt == "iges":
        # Try Zoo.dev: GLB → IGES (fast) or KCL → IGES (fallback)
        if fixture_kcl or best_glb_url:
            from app.services.zoo_service import compile_kcl_to_format
            iges_bytes = await compile_kcl_to_format(project_id, fixture_kcl or "", "iges", glb_url=best_glb_url)
            if iges_bytes:
                iges_fn = f"{part_number}_{project_name}.igs".replace(" ", "_")
                return Response(
                    content=iges_bytes,
                    media_type=MIME_TYPES["iges"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{iges_fn}"',
                        "X-Export-Format": "iges",
                        "X-Project-Name": project_name,
                        "X-Source": "zoo_kcl",
                    },
                )
        # Try OCCT engine: build real solid → IGES
        if _OCCT_AVAILABLE and features_json_full is not None:
            occt_bytes = _occt.features_to_iges_bytes(features_json_full)
            if occt_bytes:
                iges_fn = f"{part_number}_{project_name}.igs".replace(" ", "_")
                return Response(
                    content=occt_bytes,
                    media_type=MIME_TYPES["iges"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{iges_fn}"',
                        "X-Export-Format": "iges",
                        "X-Project-Name": project_name,
                        "X-Source": "occt_engine",
                    },
                )
        content = _generate_iges_stub(project_name, part_number)
        mime = MIME_TYPES["iges"]
        filename = f"{part_number}_{project_name}.igs".replace(" ", "_")

    elif fmt == "dxf":
        # Try Zoo.dev: GLB → DXF (fast) or KCL → DXF (fallback)
        if fixture_kcl or best_glb_url:
            from app.services.zoo_service import compile_kcl_to_format
            dxf_bytes = await compile_kcl_to_format(project_id, fixture_kcl or "", "dxf", glb_url=best_glb_url)
            if dxf_bytes:
                dxf_fn = f"{part_number}_{project_name}.dxf".replace(" ", "_")
                return Response(
                    content=dxf_bytes,
                    media_type=MIME_TYPES["dxf"],
                    headers={
                        "Content-Disposition": f'attachment; filename="{dxf_fn}"',
                        "X-Export-Format": "dxf",
                        "X-Project-Name": project_name,
                        "X-Source": "zoo_kcl",
                    },
                )
        content = _generate_dxf_stub(project_name, features)
        mime = MIME_TYPES["dxf"]
        filename = f"{part_number}_{project_name}.dxf".replace(" ", "_")

    return Response(
        content=content,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Format": fmt,
            "X-Project-Name": project_name,
        },
    )
