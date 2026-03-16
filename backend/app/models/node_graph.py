from pydantic import BaseModel
from datetime import datetime
from typing import Any


class NodeParam(BaseModel):
    name: str
    value: Any
    unit: str | None = None
    type: str = "number"          # number | string | boolean | select


class NodeDef(BaseModel):
    id: str
    label: str
    category: str                 # input | foundation | geometry | print | output
    x: float
    y: float
    w: float = 180
    h: float = 80
    params: list[NodeParam] = []
    ai_generated: bool = False
    special: str | None = None    # layer-profile | dfm


class Connection(BaseModel):
    from_node: str                # node id
    from_port: str                # param name or 'output'
    to_node: str
    to_port: str


class NodeGraphResponse(BaseModel):
    id: str
    project_id: str
    nodes: list[NodeDef]
    connections: list[Connection]
    generated_at: datetime


class NodeUpdate(BaseModel):
    params: list[NodeParam]
