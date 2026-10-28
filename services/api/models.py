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
    client_id: UUID | None = None
    scenario_id: UUID
    mode: Literal['practice', 'exam'] = 'practice'

class Body(Input):
    # `body` is retained for the original API; the shared contract uses answer/question_id.
    body: str | None = Field(default=None, min_length=1, max_length=8000)
    question_id: str | None = Field(default=None, max_length=200)
    answer: str | None = Field(default=None, min_length=1, max_length=8000)

class AlertPatch(Input):
    verdict: Literal['true_positive', 'false_positive', 'benign']
    rationale: str = Field(min_length=1, max_length=8000)
    open_ticket: bool = False

class SettingsPayload(Input):
    schedule: dict = Field(default_factory=dict)
    notifications: dict = Field(default_factory=dict)
    on_call: bool = False

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
