from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any


class FaceInfo(BaseModel):
    id: str
    area_mm2: float
    normal: list[float]          # [nx, ny, nz]
    centroid: list[float]        # [x, y, z]
    is_planar: bool
    is_datum_candidate: bool = False


class PartFeatures(BaseModel):
    bounding_box: dict           # { x, y, z } dimensions
    volume_mm3: float
    surface_area_mm2: float
    face_count: int
    edge_count: int
    hole_count: int
    faces: list[FaceInfo] = []
    datum_candidates: list[str] = []   # face IDs
    detected_holes: list[dict] = []    # { center, diameter, depth, axis }
    material_hint: str | None = None


class PartGeometryResponse(BaseModel):
    id: str
    project_id: str
    step_file_url: str
    gltf_url: str | None
    features: PartFeatures | None
    processing_status: str   # pending | processing | ready | error
    created_at: datetime


class FixtureGeometryResponse(BaseModel):
    id: str
    project_id: str
    version: int
    kcl: str | None             # KCL source code
    gltf_url: str | None        # Zoo.dev GLTF output
    generation_prompt: str | None
    generated_at: datetime


class VariationMetadata(BaseModel):
    varied_parameter: str
    varied_value: str
    label: str = ""
    description: str | None = None


class VariationResponse(BaseModel):
    id: str
    project_id: str
    version: int
    variation_group_id: str
    variation_index: int
    variation_metadata: VariationMetadata | None
    gltf_url: str | None
    generation_prompt: str | None
    generated_at: datetime


class VariationGroupResponse(BaseModel):
    variation_group_id: str
    prompt: str
    num_variations: int
    variations: list[VariationResponse]
    created_at: datetime


class GenerateVariationsRequest(BaseModel):
    prompt: str
    num_variations: int = Field(default=5, ge=2, le=10)
    variation_parameters: list[str] = Field(default_factory=list)
