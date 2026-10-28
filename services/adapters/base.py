from typing import Protocol
from services.common.errors import DomainError

READ_TOOLS = {'read.ipconfig', 'read.health', 'read.http', 'read.logs'}
ACTIONS = {'start', 'stop', 'reboot', 'snapshot', 'revert'}


def guard(node, allowed_targets=None):
    if 'lab' not in node.get('tags', []) or node.get('platform_host', False):
        raise DomainError('unsafe_target', 'Actions are restricted to tagged lab nodes', 403)
    if allowed_targets is not None and node['id'] not in allowed_targets:
        raise DomainError('unsafe_target', 'Target is outside the scenario scope', 403)


class Adapter(Protocol):
    def action(self, node: dict, action: str, operation_id: str, args: dict) -> dict: ...
    def read(self, node: dict, tool: str) -> dict: ...
    def lifecycle(self, node: dict, phase: str, script: str, operation_id: str) -> dict: ...
