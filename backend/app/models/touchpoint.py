from pydantic import BaseModel, model_validator
from datetime import datetime
from enum import Enum


class TouchpointType(str, Enum):
    locating = "locating"
    clamping = "clamping"
    support  = "support"


class TouchpointCreate(BaseModel):
    label: str
    type: TouchpointType
    face_id: str
    coords: list[float]           # [x, y, z]
    detail: str | None = None
    force_n: float | None = None


class TouchpointUpdate(BaseModel):
    label: str | None = None
    type: TouchpointType | None = None
    force_n: float | None = None
    detail: str | None = None


class TouchpointResponse(BaseModel):
    id: str
    project_id: str
    label: str
    type: TouchpointType
    face_id: str
    coords: list[float]
    detail: str | None
    force_n: float | None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _remap_coords(cls, values):
        """DB stores coords as coords_json; map it to coords."""
        if isinstance(values, dict) and "coords_json" in values and "coords" not in values:
            values["coords"] = values["coords_json"]
        return values


class ConstraintStatus(BaseModel):
    """3-2-1 rule completeness summary"""
    locating_count: int
    clamping_count: int
    support_count: int
    fully_constrained: bool
    missing: list[str] = []       # human-readable description of what's missing
