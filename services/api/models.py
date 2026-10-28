from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')

class Action(Input):
    action: Literal['start', 'stop', 'reboot', 'snapshot', 'revert']
    arguments: dict[str, str] = Field(default_factory=dict, max_length=5)

class Console(Input):
    protocol: Literal['ssh', 'rdp', 'vnc', 'serial']

class TicketPatch(Input):
    status: Literal['acknowledged', 'investigating', 'client_explanation'] | None = None
    assignee: UUID | None = None
    work_notes: str | None = Field(default=None, max_length=16000)

class Chat(Input):
    body: str = Field(min_length=1, max_length=8000)
    channel: Literal['chat', 'email', 'voice'] = 'chat'

class Identity(Input):
    answers: dict[str, str] = Field(max_length=10)

class Launch(Input):
    client_id: UUID
    scenario_id: UUID

class Body(Input):
    body: str = Field(min_length=1, max_length=8000)

class Restore(Input):
    client_id: UUID
    confirmation_token: str = Field(min_length=1, max_length=2048)

class Tenant(Input):
    client_id: UUID

class Subscribe(Input):
    token: str = Field(min_length=1, max_length=16384)
    after_seq: int = Field(default=0, ge=0)
    topics: list[str] = Field(default_factory=list, max_length=30)
    client_ids: list[UUID] = Field(default_factory=list, max_length=100)

class ConsoleConnect(Input):
    token: str = Field(min_length=32, max_length=128)
