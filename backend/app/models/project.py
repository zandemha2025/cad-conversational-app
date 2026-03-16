from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    draft = "draft"
    active = "active"
    released = "released"
    archived = "archived"


class EnvironmentConfig(BaseModel):
    surface: str = "siegmund"           # siegmund | tslot | robot | cmm | vise | custom
    mounting_pattern: str = "siegmund-28"
    robot_enabled: bool = False
    robot_model: str | None = None
    overhead_clearance_mm: float | None = None
    side_clearance_mm: float | None = None
    face_up: str = "TOP"
    notes: str | None = None


class PrinterProfile(BaseModel):
    process: str = "fff"               # fff | sla | metal
    machine: str = "bambu-x1c"
    nozzle_diameter_mm: float = 0.4
    layer_height_mm: float = 0.20
    material: str = "PA12-CF"
    print_orientation: str = "auto"    # auto | horizontal | vertical
    infill_pattern: str = "gyroid"
    infill_percent: int = 25


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    part_number: str | None = None
    revision: str | None = "A"
    template_id: str | None = None
    material: str | None = None
    gdt_standard: str = "ASME Y14.5-2018"
    quality_standard: str | None = None
    environment: EnvironmentConfig = Field(default_factory=EnvironmentConfig)
    printer_profile: PrinterProfile = Field(default_factory=PrinterProfile)
    initial_prompt: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    part_number: str | None = None
    material: str | None = None
    gdt_standard: str | None = None
    quality_standard: str | None = None
    environment: EnvironmentConfig | None = None
    printer_profile: PrinterProfile | None = None
    status: ProjectStatus | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    part_number: str | None = None
    revision: str | None = None
    template_id: str | None = None
    material: str | None = None
    gdt_standard: str = "ASME Y14.5-2018"
    quality_standard: str | None = None
    status: ProjectStatus = ProjectStatus.draft
    environment_json: Any = None
    printer_profile_json: Any = None
    user_id: str
    org_id: str | None = None
    created_at: datetime
    updated_at: datetime

    # Derived counts (populated by API)
    validation_error_count: int = 0
    validation_warning_count: int = 0
    has_part_geometry: bool = False
    has_fixture_geometry: bool = False
