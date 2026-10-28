"""Deterministic persistent lab simulation. Caller saves returned node changes."""
from copy import deepcopy
from .base import ACTIONS, READ_TOOLS, guard
from services.common.errors import DomainError

class FakeAdapter:
    def __init__(self, system):
        self.system = system

    def action(self, node, action, operation_id, args):
        guard(node)
        if action not in ACTIONS:
            raise DomainError('unsupported_action', 'Unsupported action')
        state = deepcopy(node.get('lab_state', {}))
        if action in ('start', 'reboot'):
            state['power'] = 'running'
        elif action == 'stop':
            state['power'] = 'stopped'
        elif action == 'snapshot':
            state['snapshot'] = {k: v for k, v in state.items() if k != 'snapshot'}
        elif action == 'revert':
            state = deepcopy(node['baseline'] if args.get('baseline') else (state.get('snapshot') or node['baseline']))
        # Deliberate fake-only management operation used to demonstrate a real fix.
        if 'gateway' in args:
            state['gateway'] = args['gateway']
        return {'lab_state': state, 'operation_id': operation_id, 'simulated': True}

    def read(self, node, tool):
        if tool not in READ_TOOLS:
            raise DomainError('tool_denied', 'Only allowlisted read tools may be called', 403)
        state = node['lab_state']
        if tool == 'read.ipconfig':
            return {'ip': node['mgmt_ip'], 'gateway': state['gateway']}
        if tool == 'read.http':
            return {'reachable': state['gateway'] == node['baseline']['gateway'] and state['power'] == 'running'}
        if tool == 'read.logs':
            return {'entries': state.get('logs', [])}
        return {'power': state['power']}

    def lifecycle(self, node, phase, script, operation_id):
        guard(node)
        state = deepcopy(node['lab_state'])
        if phase == 'setup':
            state['gateway'] = '10.10.20.254'
        elif phase in ('cleanup', 'solve'):
            state = deepcopy(node['baseline'])
        elif phase == 'check':
            passed = state['gateway'] == node['baseline']['gateway'] and state['power'] == 'running'
            return {'passed': passed, 'output': 'Connectivity verified' if passed else 'Gateway or connectivity check failed'}
        else:
            raise DomainError('invalid_phase', 'Unknown lifecycle phase')
        return {'lab_state': state, 'operation_id': operation_id, 'simulated': True}
