from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class GenerationStatus(str, Enum):
    queued      = "queued"
    classifying = "classifying"     # Gemini Flash intent check
    generating  = "generating"      # Gemini Pro writing KCL
    compiling   = "compiling"       # Zoo.dev compiling KCL → GLTF
    validating  = "validating"      # Running DFM checks
    done        = "done"
    error       = "error"


class GenerateFixtureRequest(BaseModel):
    """Sent when user types a fixture generation command in chat"""
    project_id: str
    prompt: str
    version: int | None = None      # if None, increments automatically


class GenerationEvent(BaseModel):
    """WebSocket progress event streamed to browser"""
    job_id: str
    status: GenerationStatus
    message: str
    progress: float = 0.0           # 0.0 – 1.0
    fixture_id: str | None = None   # set when done
    error: str | None = None


class ChatMessage(BaseModel):
    role: str                        # user | assistant
    content: str
    attachments: list[dict] = []
    linked_node_id: str | None = None
    created_at: datetime | None = None


class ChatSendRequest(BaseModel):
    content: str
    attachments: list[dict] = []
    linked_node_id: str | None = None


class ExportFormat(str, Enum):
    step = "step"
    stl  = "stl"
    tmf  = "3mf"
    pdf  = "pdf"
    dxf  = "dxf"
    iges = "iges"


class ExportRequest(BaseModel):
    format: ExportFormat


class ExportResponse(BaseModel):
    job_id: str
    download_url: str | None = None   # populated when done
    status: str = "queued"
