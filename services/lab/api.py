"""Additive lab API. Shared /api/v1 contracts are intentionally unchanged."""
from typing import Any, Literal
from uuid import UUID
from fastapi import Depends, Header, Query
from pydantic import Field
from services.common.errors import DomainError
from .domain import Topology, SCHEMAS, get, listing, revision, snapshot
from .models import Model, Packet
from .sessions import Sessions


class Edit(Model):
    data: dict[str, Any]
    version: int | None = Field(default=None, ge=1)


class OpenSession(Model):
    device_id: UUID
    protocol: Literal['ssh', 'rdp', 'vnc', 'serial', 'novnc', 'guacamole']


class SessionAction(Model):
    version: int = Field(ge=1)
    token: str | None = Field(default=None, max_length=2048)
    command: Literal['show_interfaces', 'show_routes', 'show_health', 'ipconfig', 'whoami'] | None = None


class Fault(Model):
    name: str = Field(max_length=60)
    target_id: UUID
    value: Any


class Version(Model):
    version: int = Field(ge=1)


def install(app, store, principal, tokens, mode):
    import os
    from services.adapters.lab_console import BrokerConsoleTransport
    transport = BrokerConsoleTransport() if mode == 'live' and os.getenv('AEGIS_CONSOLE_BROKER_ENABLED') == 'true' else None
    sessions = Sessions(tokens, mode, transport)
    domain = Topology(store, sessions)
    app.state.lab = domain
    prefix = '/api/lab/v1/tenants/{client_id}'

    def execute(actor, client_id, key, rev, operation, payload):
        return domain.execute(actor, str(client_id), key, rev, operation, payload)

    @app.get(prefix + '/schemas')
    def schemas(client_id: UUID, actor=Depends(principal)):
        actor.require(str(client_id))
        return {kind: schema.model_json_schema() for kind, schema in SCHEMAS.items()}

    @app.get(prefix + '/topology')
    def topology(client_id: UUID, actor=Depends(principal)):
        actor.require(str(client_id))
        with store.transaction() as tx:
            return {'revision': revision(tx, str(client_id)), **snapshot(tx, str(client_id)),
                    'active_layout': listing(tx, 'active-layout', str(client_id))}

    @app.post(prefix + '/packets', status_code=202)
    def packet(client_id: UUID, body: Packet, idempotency_key: str = Header(),
               if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'packet', body.model_dump(mode='json'))

    @app.post(prefix + '/baseline/{action}', status_code=202)
    def baseline(client_id: UUID, action: Literal['save', 'restore'], idempotency_key: str = Header(),
                 if_match: int = Header(ge=0), actor=Depends(principal)):
        actor.require(str(client_id), admin=True)
        return execute(actor, client_id, idempotency_key, if_match, 'baseline.' + action, {})

    @app.post(prefix + '/sessions', status_code=202)
    def session(client_id: UUID, body: OpenSession, idempotency_key: str = Header(),
                if_match: int = Header(ge=0), actor=Depends(principal)):
        result = execute(actor, client_id, idempotency_key, if_match, 'session.open', body.model_dump(mode='json'))
        return {**result, 'grant': sessions.grant(result['result']), 'expires_in': 60}

    @app.post(prefix + '/sessions/{identifier}/{action}', status_code=202)
    def session_change(client_id: UUID, identifier: UUID, action: Literal['connect', 'command', 'terminate'],
                       body: SessionAction, idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'session.' + action,
                       {'id': str(identifier), **body.model_dump(exclude_none=True)})

    @app.get(prefix + '/scenarios')
    def scenario_packs(client_id: UUID, actor=Depends(principal)):
        from .scenarios import PACKS
        actor.require(str(client_id))
        return {'items': list(PACKS.values())}

    @app.post(prefix + '/scenario-runs', status_code=202)
    def scenario_start(client_id: UUID, body: Fault, idempotency_key: str = Header(),
                       if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'scenario.setup', body.model_dump(mode='json'))

    @app.post(prefix + '/scenario-runs/{identifier}/{phase}', status_code=202)
    def scenario_phase(client_id: UUID, identifier: UUID, phase: Literal['check', 'solve', 'cleanup'], body: Version,
                       idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'scenario.' + phase,
                       {'id': str(identifier), 'version': body.version})

    @app.post(prefix + '/faults', status_code=202)
    def inject(client_id: UUID, body: Fault, idempotency_key: str = Header(),
               if_match: int = Header(ge=0), actor=Depends(principal)):
        actor.require(str(client_id), admin=True)
        return execute(actor, client_id, idempotency_key, if_match, 'fault.setup', body.model_dump(mode='json'))

    @app.post(prefix + '/faults/{identifier}/{phase}', status_code=202)
    def fault_phase(client_id: UUID, identifier: UUID, phase: Literal['check', 'solve', 'cleanup'], body: Version,
                    idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        actor.require(str(client_id), admin=True)
        return execute(actor, client_id, idempotency_key, if_match, 'fault.' + phase,
                       {'id': str(identifier), 'version': body.version})

    @app.post(prefix + '/devices/{identifier}/power/{action}', status_code=202)
    def power(client_id: UUID, identifier: UUID, action: Literal['on', 'off', 'reboot'], body: Version,
              idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'power',
                       {'id': str(identifier), 'version': body.version, 'action': action})

    @app.post(prefix + '/layouts/{identifier}/restore', status_code=202)
    def restore_layout(client_id: UUID, identifier: UUID, body: Version,
                       idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'layout.restore',
                       {'id': str(identifier), 'version': body.version})

    @app.get(prefix + '/objects/{kind}')
    def objects(client_id: UUID, kind: str, actor=Depends(principal)):
        actor.require(str(client_id))
        if kind not in SCHEMAS:
            raise DomainError('not_found', 'Unknown topology object', 404)
        with store.transaction() as tx:
            return {'items': listing(tx, kind, str(client_id)), 'revision': revision(tx, str(client_id))}

    @app.get(prefix + '/objects/{kind}/{identifier}')
    def inspect(client_id: UUID, kind: str, identifier: UUID, actor=Depends(principal)):
        actor.require(str(client_id))
        if kind not in SCHEMAS:
            raise DomainError('not_found', 'Unknown topology object', 404)
        with store.transaction() as tx:
            return get(tx, kind, identifier, str(client_id))

    @app.post(prefix + '/objects/{kind}', status_code=202)
    def create(client_id: UUID, kind: str, body: Edit, idempotency_key: str = Header(),
               if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'create', {'kind': kind, 'data': body.data})

    @app.patch(prefix + '/objects/{kind}/{identifier}', status_code=202)
    def update(client_id: UUID, kind: str, identifier: UUID, body: Edit, idempotency_key: str = Header(),
               if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'update',
                       {'kind': kind, 'id': str(identifier), 'data': body.data, 'version': body.version})

    @app.delete(prefix + '/objects/{kind}/{identifier}', status_code=202)
    def delete(client_id: UUID, kind: str, identifier: UUID, version: int = Query(ge=1),
               idempotency_key: str = Header(), if_match: int = Header(ge=0), actor=Depends(principal)):
        return execute(actor, client_id, idempotency_key, if_match, 'delete',
                       {'kind': kind, 'id': str(identifier), 'version': version})
