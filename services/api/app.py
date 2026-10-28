import asyncio
import base64
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID
from fastapi import Depends, FastAPI, Header, Query, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from services.common.config import Settings
from services.common.store import Store, now
from services.common.security import ConfirmationTokens
from services.common.errors import DomainError
from services.common.bus import RedisBus
from services.adapters.registry import Registry
from services.adapters.base import guard
from services.adapters.guacamole import ConsoleBroker
from services.ai.provider import Provider
from services.ai import service as ai
from services.evidence import service as evidence
from services.orchestrator.service import Orchestrator
from services.orchestrator.scenarios import public as public_scenario
from .auth import Auth
from .projections import public_node, client_detail, node_detail
from .models import Action, Console, TicketPatch, Chat, Identity, Launch, Body, Restore, Tenant, Subscribe, ConsoleConnect

log = logging.getLogger('aegis.api')


def page(items, cursor, limit):
    items = sorted(items, key=lambda v: v['id'])
    after = ''
    if cursor:
        try:
            after = base64.b64decode(cursor, altchars=b'-_', validate=True).decode()
            UUID(after)
        except (ValueError, UnicodeError):
            raise DomainError('invalid_cursor', 'Cursor is invalid')
    remaining = [item for item in items if item['id'] > after]
    selected = remaining[:limit]
    next_cursor = base64.urlsafe_b64encode(selected[-1]['id'].encode()).decode() if len(remaining) > limit else None
    return {'items': selected, 'next_cursor': next_cursor}


def public_job(job):
    return {k: job[k] for k in ('id', 'client_id', 'kind', 'state', 'created_at', 'updated_at', 'result', 'error') if k in job}


def create_app(settings=None, store=None):
    settings = settings or Settings()
    settings.validate()
    store = store or Store(settings.database_url)
    tokens = ConfirmationTokens(settings.confirmation_secret)
    registry, provider, auth = Registry(settings.adapter_mode), Provider(settings.llm_mode), Auth(settings)
    engine = Orchestrator(store, registry, provider, tokens)
    bus = RedisBus(settings.redis_url) if settings.redis_url else None

    @asynccontextmanager
    async def lifespan(app):
        # Deployment initializes schema using Alembic, never from request handling.
        yield

    app = FastAPI(title='SALONE AEGIS Backend', version='0.1.0', lifespan=lifespan,
                  docs_url='/docs' if settings.environment == 'development' else None,
                  redoc_url=None)
    app.state.engine, app.state.store = engine, store

    @app.exception_handler(DomainError)
    async def domain_error(request, exc):
        return JSONResponse(exc.payload(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        details = [{'field': '.'.join(map(str, e['loc'])), 'type': e['type']} for e in exc.errors()]
        return JSONResponse(DomainError('validation_error', 'Request validation failed', 422, details).payload(), status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(DomainError('http_error', str(exc.detail), exc.status_code).payload(), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        log.error(json.dumps({'event': 'request.failed', 'exception': type(exc).__name__}))
        return JSONResponse(DomainError('internal_error', 'Internal service error', 500).payload(), status_code=500)

    @app.middleware('http')
    async def request_log(request, call_next):
        started = time.monotonic()
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        log.info(json.dumps({'event': 'http.request', 'method': request.method, 'path': request.url.path,
                             'status': response.status_code, 'duration_ms': round((time.monotonic() - started) * 1000)}))
        return response

    def principal(authorization: str = Header(default='')):
        if not authorization.startswith('Bearer '):
            raise DomainError('unauthorized', 'Bearer authentication is required', 401)
        actor = auth.authenticate(authorization[7:])
        if bus:
            key = 'rate:' + actor.id + ':' + str(int(time.time()) // 60)
            count = bus.redis.incr(key)
            if count == 1:
                bus.redis.expire(key, 120)
            if count > 240:
                raise DomainError('rate_limited', 'Request limit exceeded', 429)
        return actor

    def owned(tx, kind, identifier, actor, write=False, admin=False):
        actor.require(write=write, admin=admin)
        item = tx.get(kind, str(identifier))
        actor.require(item['client_id'])
        return item

    def enqueue(tx, actor, kind, cid, payload, idem):
        actor.require(cid, write=True)
        job = engine.submit(tx, kind, cid, actor.id, payload, idem)
        return {'job_id': job['id'], 'state': job['state']}

    @app.get('/health/live', tags=['health'])
    def live():
        return {'status': 'ok'}

    @app.get('/health/ready', tags=['health'])
    def ready():
        try:
            with store.transaction() as tx:
                tx.execute('SELECT seq FROM events LIMIT 1')
            if bus:
                bus.redis.ping()
            return {'status': 'ready'}
        except Exception:
            return JSONResponse({'status': 'unavailable'}, status_code=503)

    prefix = '/api/v1'

    @app.get(prefix + '/me')
    def me(actor=Depends(principal)):
        return {'id': actor.id, 'roles': actor.roles, 'client_ids': actor.client_ids, 'preferences': {}}

    @app.get(prefix + '/clients')
    def clients(cursor: str | None = None, limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        with store.transaction() as tx:
            return page([client_detail(tx, c) for c in tx.list('client') if c['id'] in actor.client_ids], cursor, limit)

    @app.get(prefix + '/clients/{identifier}')
    def client(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            return client_detail(tx, owned(tx, 'client', identifier, actor))

    @app.get(prefix + '/topology')
    def topology(client_id: UUID, actor=Depends(principal)):
        cid = str(client_id)
        actor.require(cid)
        with store.transaction() as tx:
            return {'client_id': cid, 'sites': tx.list('site', cid),
                    'nodes': [public_node(n) for n in tx.list('node', cid)], 'links': tx.list('link', cid)}

    @app.get(prefix + '/nodes/{identifier}')
    def node(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            return node_detail(tx, owned(tx, 'node', identifier, actor))

    @app.post(prefix + '/nodes/{identifier}/actions', status_code=202)
    def node_action(identifier: UUID, body: Action, idempotency_key: str = Header(), actor=Depends(principal)):
        with store.transaction() as tx:
            node = owned(tx, 'node', identifier, actor, write=True)
            if body.arguments and (settings.adapter_mode != 'fake' or set(body.arguments) - {'gateway'}):
                raise DomainError('invalid_arguments', 'Only fake mode permits the gateway demonstration argument')
            return enqueue(tx, actor, 'node.action', node['client_id'],
                           {'node_id': node['id'], **body.model_dump()}, idempotency_key)

    @app.post(prefix + '/nodes/{identifier}/console-sessions')
    def console(identifier: UUID, body: Console, actor=Depends(principal)):
        with store.transaction() as tx:
            node = owned(tx, 'node', identifier, actor, write=True)
            if settings.adapter_mode == 'fake':
                raise DomainError('console_unavailable', 'Fake mode has no interactive console; connect a Guacamole broker', 503)
            guard(node)
            if not bus:
                raise DomainError('console_unavailable', 'Redis is required for console grants', 503)
            result = ConsoleBroker(bus.redis).issue(node, body.protocol, actor.id)
            evidence.append(tx, node['client_id'], None, 'console.created', {'node_id': node['id'], 'protocol': body.protocol}, actor.id)
            return result

    @app.post(prefix + '/console-sessions/connect')
    def connect_console(body: ConsoleConnect, actor=Depends(principal)):
        actor.require(write=True)
        if not bus or settings.adapter_mode != 'live':
            raise DomainError('console_unavailable', 'Live consoles are not configured', 503)
        grant = ConsoleBroker(bus.redis).redeem(body.token, actor.id)
        actor.require(grant['client_id'])
        with store.transaction() as tx:
            node = owned(tx, 'node', grant['node_id'], actor, write=True)
            result = registry.adapters['guacamole'].session(node, grant['protocol'], actor.id)
            evidence.append(tx, node['client_id'], None, 'console.connected', {'node_id': node['id']}, actor.id)
            return result

    @app.get(prefix + '/notifications')
    def notifications(client_id: UUID | None = None, cursor: str | None = None,
                      limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        if client_id:
            actor.require(str(client_id))
        with store.transaction() as tx:
            return page([n for n in tx.list('notification', str(client_id) if client_id else None)
                         if n['client_id'] in actor.client_ids], cursor, limit)

    @app.post(prefix + '/notifications/{identifier}/ack')
    def ack(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            notice = owned(tx, 'notification', identifier, actor, write=True)
            notice['acknowledged'] = True
            tx.put('notification', notice)
            evidence.append(tx, notice['client_id'], notice.get('ticket_id'), 'notification.acknowledged', {'id': notice['id']}, actor.id)
            return notice

    @app.get(prefix + '/tickets')
    def tickets(client_id: UUID | None = None, priority: str | None = None, status: str | None = None,
                sla_breach: bool | None = None, cursor: str | None = None,
                limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        if client_id:
            actor.require(str(client_id))
        with store.transaction() as tx:
            items = [t for t in tx.list('ticket', str(client_id) if client_id else None) if t['client_id'] in actor.client_ids]
            if priority:
                items = [t for t in items if t['priority'] == priority]
            if status:
                items = [t for t in items if t['status'] == status]
            if sla_breach is not None:
                items = [t for t in items if (t['status'] != 'closed' and t['sla_due_at'] < now()) == sla_breach]
            return page(items, cursor, limit)

    @app.get(prefix + '/tickets/{identifier}')
    def ticket(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            return owned(tx, 'ticket', identifier, actor)

    @app.patch(prefix + '/tickets/{identifier}')
    def patch(identifier: UUID, body: TicketPatch, actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor, write=True)
            return engine.patch_ticket(tx, ticket, body.model_dump(mode='json', exclude_unset=True), actor.id)

    @app.post(prefix + '/tickets/{identifier}/resolve', status_code=202)
    def resolve(identifier: UUID, idempotency_key: str = Header(), actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor, write=True)
            return enqueue(tx, actor, 'ticket.resolve', ticket['client_id'], {'ticket_id': ticket['id']}, idempotency_key)

    @app.get(prefix + '/tickets/{identifier}/chat')
    def chat_history(identifier: UUID, cursor: str | None = None, limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor)
            return page([c for c in tx.list('chat', ticket['client_id']) if c['ticket_id'] == ticket['id']], cursor, limit)

    @app.post(prefix + '/tickets/{identifier}/chat', status_code=202)
    def chat(identifier: UUID, body: Chat, idempotency_key: str = Header(), actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor, write=True)
            if ticket['status'] == 'closed':
                raise DomainError('invalid_state', 'Ticket is closed', 409)
            job = engine.submit(tx, 'chat.reply', ticket['client_id'], actor.id,
                                {'ticket_id': ticket['id'], **body.model_dump()}, idempotency_key)
            if not job.get('message_recorded'):
                ai.message(tx, ticket, body.body, 'operator', body.channel)
                job['message_recorded'] = True
                engine.save_job(tx, job)
            return {'job_id': job['id'], 'state': job['state']}

    @app.post(prefix + '/tickets/{identifier}/chat/verify-identity')
    def verify_identity(identifier: UUID, body: Identity, actor=Depends(principal)):
        if any(len(k) > 100 or len(v) > 300 for k, v in body.answers.items()):
            raise DomainError('validation_error', 'Identity field is too long', 422)
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor, write=True)
            return ai.identity(tx, ticket, body.answers, actor.id)

    @app.get(prefix + '/scenarios')
    def scenarios(cursor: str | None = None, limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        with store.transaction() as tx:
            return page([public_scenario(s) for s in tx.list('scenario')], cursor, limit)

    @app.post(prefix + '/scenario-runs', status_code=202)
    def launch(body: Launch, idempotency_key: str = Header(), actor=Depends(principal)):
        actor.require(str(body.client_id), write=True, admin=True)
        with store.transaction() as tx:
            return enqueue(tx, actor, 'scenario.launch', str(body.client_id), {'scenario_id': str(body.scenario_id)}, idempotency_key)

    @app.post(prefix + '/scenario-runs/{identifier}/hint')
    def hint(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            run = owned(tx, 'run', identifier, actor, write=True)
            if run['state'] != 'running':
                raise DomainError('invalid_state', 'Hints are available only for running scenarios', 409)
            index = run['hints_used']
            if index >= len(run['definition']['hints']):
                raise DomainError('hints_exhausted', 'No hints remain', 409)
            run['hints_used'] += 1
            tx.put('run', run)
            result = {'hint': run['definition']['hints'][index], 'points_cost': 5, 'hints_used': run['hints_used']}
            evidence.append(tx, run['client_id'], run['ticket_id'], 'hint.used', result, actor.id)
            return result

    @app.post(prefix + '/scenario-runs/{identifier}/abort', status_code=202)
    def abort(identifier: UUID, idempotency_key: str = Header(), actor=Depends(principal)):
        with store.transaction() as tx:
            run = owned(tx, 'run', identifier, actor, write=True)
            return enqueue(tx, actor, 'scenario.abort', run['client_id'], {'run_id': run['id']}, idempotency_key)

    @app.get(prefix + '/tickets/{identifier}/debrief')
    def debrief(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor)
            matches = [d for d in tx.list('debrief', ticket['client_id']) if d['ticket_id'] == ticket['id']]
            if not matches:
                raise DomainError('not_found', 'Debrief has not started', 404)
            return matches[0]

    @app.post(prefix + '/debriefs/{identifier}/answers', status_code=202)
    def answer(identifier: UUID, body: Body, idempotency_key: str = Header(), actor=Depends(principal)):
        with store.transaction() as tx:
            item = owned(tx, 'debrief', identifier, actor, write=True)
            return enqueue(tx, actor, 'debrief.answer', item['client_id'], {'debrief_id': item['id'], 'body': body.body}, idempotency_key)

    @app.post(prefix + '/debriefs/{identifier}/defer')
    def defer(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            item = owned(tx, 'debrief', identifier, actor, write=True)
            if item['state'] != 'active':
                raise DomainError('invalid_state', 'Only active debriefs can be deferred', 409)
            item.update(state='deferred', deferred=True)
            tx.put('debrief', item)
            evidence.append(tx, item['client_id'], item['ticket_id'], 'debrief.deferred', {}, actor.id)
            return item

    @app.get(prefix + '/evidence')
    def evidence_list(ticket_id: UUID, cursor: str | None = None, limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', ticket_id, actor)
            # Viewer role is sanitized at export; live raw evidence is operator/admin only.
            actor.require(write=True)
            return page(evidence.records(tx, ticket['client_id'], ticket['id']), cursor, limit)

    @app.get(prefix + '/scorecards')
    def scorecards(client_id: UUID, actor=Depends(principal)):
        actor.require(str(client_id))
        with store.transaction() as tx:
            return evidence.scorecard(tx, str(client_id))

    @app.get(prefix + '/flows')
    def flows(edge_id: UUID, since: datetime | None = None, cursor: str | None = None,
              limit: int = Query(50, ge=1, le=200), actor=Depends(principal)):
        if since and since.tzinfo is None:
            raise DomainError('validation_error', 'since must include a timezone', 422)
        with store.transaction() as tx:
            edge = owned(tx, 'link', edge_id, actor)
            items = [f for f in tx.list('flow', edge['client_id']) if f['edge_id'] == edge['id']]
            if since:
                items = [f for f in items if datetime.fromisoformat(f['observed_at'].replace('Z', '+00:00')) >= since]
            return page(items, cursor, limit)

    @app.get(prefix + '/replay/{identifier}')
    def replay(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            ticket = owned(tx, 'ticket', identifier, actor)
            actor.require(write=True)
            return {'ticket_id': ticket['id'], 'timeline': evidence.records(tx, ticket['client_id'], ticket['id'])}

    @app.post(prefix + '/lab/baseline/restore', status_code=202)
    def restore(body: Restore, idempotency_key: str = Header(), actor=Depends(principal)):
        actor.require(str(body.client_id), admin=True)
        with store.transaction() as tx:
            return enqueue(tx, actor, 'baseline.restore', str(body.client_id), body.model_dump(mode='json'), idempotency_key)

    # Additive proposals required for usable job inspection and destructive confirmation.
    @app.post(prefix + '/lab/baseline/confirmation')
    def confirmation(body: Tenant, actor=Depends(principal)):
        actor.require(str(body.client_id), admin=True)
        with store.transaction() as tx:
            evidence.append(tx, str(body.client_id), None, 'baseline.confirmation_issued', {}, actor.id)
        return {'confirmation_token': tokens.issue(actor.id, str(body.client_id), 'baseline.restore'), 'expires_in': 300}

    @app.get(prefix + '/jobs/{identifier}')
    def job(identifier: UUID, actor=Depends(principal)):
        with store.transaction() as tx:
            row = tx.execute('SELECT data FROM jobs WHERE id=?', (str(identifier),)).fetchone()
            if not row:
                raise DomainError('not_found', 'Job not found', 404)
            result = json.loads(row['data'])
            actor.require(result['client_id'])
            return public_job(result)

    @app.websocket(prefix + '/events')
    async def events(ws: WebSocket):
        await ws.accept()
        try:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=10)
            if len(raw) > 20000:
                await ws.close(code=1009)
                return
            subscription = Subscribe.model_validate_json(raw)
            actor = await asyncio.to_thread(auth.authenticate, subscription.token)
            clients = [str(c) for c in subscription.client_ids] or actor.client_ids
            for cid in clients:
                actor.require(cid)
            # New authenticated session resumes only this operator's deferred interviews.
            if set(actor.roles) & {'operator', 'admin'}:
                def resume():
                    with store.transaction() as tx:
                        for cid in clients:
                            for item in tx.list('debrief', cid):
                                ticket = tx.get('ticket', item['ticket_id'], cid)
                                if item['state'] == 'deferred' and ticket.get('assignee') == actor.id:
                                    item.update(state='active', deferred=False)
                                    tx.put('debrief', item)
                                    tx.event('debrief.question', item, 'debrief', {'index': len(item['answers']),
                                             'question': item['questions'][len(item['answers'])]})
                                    evidence.append(tx, cid, ticket['id'], 'debrief.resumed', {}, actor.id)
                await asyncio.to_thread(resume)
            after = subscription.after_seq
            while time.time() < actor.expires_at:
                def read_events():
                    with store.transaction() as tx:
                        return tx.events(after, clients, subscription.topics)
                batch, scanned = await asyncio.to_thread(read_events)
                for event in batch:
                    await asyncio.wait_for(ws.send_json(event), timeout=10)
                progressed = scanned != after
                after = scanned
                if not progressed:
                    try:
                        # Detect disconnects and allow a client ping without URL tokens.
                        incoming = await asyncio.wait_for(ws.receive_text(), timeout=1)
                        if incoming not in ('ping', ''):
                            await ws.close(code=4400)
                            return
                    except asyncio.TimeoutError:
                        pass
            await ws.close(code=4401)
        except WebSocketDisconnect:
            pass
        except DomainError as exc:
            await ws.send_json(exc.payload())
            await ws.close(code=4403 if exc.status == 403 else 4401)
        except (ValueError, asyncio.TimeoutError):
            await ws.close(code=4400)

    return app
