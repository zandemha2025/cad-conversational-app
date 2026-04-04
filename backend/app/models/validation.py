from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class ValidationMethod(str, Enum):
    fdm        = "fdm"
    cnc        = "cnc"
    laser      = "laser"
    functional = "functional"
    standards  = "standards"
    inventory  = "inventory"
    gdt        = "gdt"


class IssueSeverity(str, Enum):
    error   = "error"
    warning = "warning"
    info    = "info"
    ok      = "ok"


class ValidationIssue(BaseModel):
    id: str
    method: ValidationMethod
    severity: IssueSeverity
    title: str
    detail: str
    location: list[float] | None = None   # [x, y, z] in model space
    node_ref: str | None = None           # node ID in node graph
    fix_suggestion: str | None = None


class ValidationResult(BaseModel):
    id: str
    project_id: str
    method: ValidationMethod
    issues: list[ValidationIssue]
    error_count: int
    warning_count: int
    ran_at: datetime


class ValidationSummary(BaseModel):
    """Lightweight summary shown in TopBar badges"""
    project_id: str
    geometry_ok: bool
    dfm_errors: int
    functional_warnings: int
    standards_warnings: int
    last_ran: datetime | None = None


class ValidationRunRequest(BaseModel):
    methods: list[ValidationMethod] | None = None  # None = run all
