"""Console grants never contain credentials; live transports are server-injected."""
from typing import Protocol
from datetime import datetime, timezone, timedelta
from services.common.errors import DomainError
from services.common.store import uid, now
from services.evidence.service import append
from .domain import device, get

COMMANDS = {'show_interfaces', 'show_routes', 'show_health', 'ipconfig', 'whoami'}
PROTOCOLS = {'ssh', 'rdp', 'vnc', 'serial', 'novnc', 'guacamole'}


class ConsoleTransport(Protocol):
    """Implementations resolve credentials and approved targets on the server."""
    def validate(self, cid: str, target_id: str, protocol: str) -> None: ...
    def operate(self, session: dict, action: str, command: str | None = None) -> dict: ...


class Sessions:
    def __init__(self, tokens, mode='fake', transport=None):
        self.tokens, self.mode, self.transport = tokens, mode, transport

    def open(self, tx, cid, actor, target, protocol):
        node = device(tx, target, cid)
        model = get(tx, 'device-models', node['model_id'], cid)
        if protocol not in PROTOCOLS or protocol not in model['protocols']:
            raise DomainError('unsupported_protocol', 'Device model does not support this console protocol', 422)
        if node['power'] != 'on' or node['health'] == 'failed':
            raise DomainError('device_unavailable', 'Device is not running', 409)
        if self.mode != 'fake':
            if self.transport is None:
                raise DomainError('live_console_unconfigured', 'An administrator must bind an approved live console transport', 503)
            self.transport.validate(cid, target, protocol)
        session = {'id': uid(), 'client_id': cid, 'device_id': node['id'], 'actor': actor,
                   'protocol': protocol, 'grant_expires_at': (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(), 'state': 'created', 'version': 1, 'created_at': now(), 'updated_at': now()}
        tx.put('lab.sessions', session)
        return session

    def grant(self, session):
        return self.tokens.issue(session['actor'], session['client_id'], 'lab.session:' + session['id'], ttl=60)

    def change(self, tx, cid, actor, identifier, version, action, token=None, command=None):
        session = get(tx, 'sessions', identifier, cid)
        if session['actor'] != actor:
            raise DomainError('forbidden', 'Console sessions belong to their creator', 403)
        if session['version'] != version:
            raise DomainError('version_conflict', 'Session changed', 409)
        if action == 'connect':
            if session['state'] != 'created':
                raise DomainError('invalid_session_state', 'Session grant was already redeemed', 409)
            if datetime.fromisoformat(session['grant_expires_at']) <= datetime.now(timezone.utc):
                raise DomainError('invalid_token', 'Session grant expired', 403)
            self.tokens.consume(tx, token or '', actor, cid, 'lab.session:' + identifier)
            node = device(tx, session['device_id'], cid)
            if node['power'] != 'on' or node['health'] == 'failed':
                raise DomainError('device_unavailable', 'Device is not running', 409)
            session['state'] = 'connected'
        elif action == 'command':
            if session['state'] != 'connected':
                raise DomainError('invalid_session_state', 'Connect the session first', 409)
            if command not in COMMANDS:
                raise DomainError('command_forbidden', 'Only structured diagnostic commands are accepted', 403)
            append(tx, cid, None, 'lab.session.command', {'session_id': identifier, 'command': command}, actor)
        elif action == 'terminate':
            session['state'] = 'terminated'
        else:
            raise DomainError('invalid_session_action', 'Unknown console operation', 422)
        live_result = None
        if self.mode != 'fake':
            if self.transport is None:
                raise DomainError('live_console_unconfigured', 'Live console transport is unavailable', 503)
            live_result = self.transport.operate(session, action, command)
        session.update(version=session['version'] + 1, updated_at=now())
        tx.put('lab.sessions', session)
        output = {'session': session}
        if live_result:
            output['connection'] = live_result
        if action == 'command' and self.mode == 'fake':
            node = device(tx, session['device_id'], cid)
            output['output'] = {'simulated': True, 'command': command, 'power': node['power'], 'health': node['health']}
            if command in ('show_interfaces', 'ipconfig'):
                output['output']['interfaces'] = [p for p in tx.list('lab.interfaces', cid) if p['device_id'] == node['id']]
            if command == 'show_routes':
                output['output']['routes'] = [r for r in tx.list('lab.routes', cid) if r['device_id'] == node['id']]
            if command == 'whoami':
                output['output']['actor'] = actor
        return output
