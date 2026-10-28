"""Optional privileged runner, deployed only on the management network.
Commands come exclusively from an administrator-owned manifest, never request text.
Run: uvicorn services.adapters.runner:create_runner --factory --port 9100
Place behind a TLS/mTLS reverse proxy. Do not publish the runner on the internet.
"""
import hashlib
import hmac
import json
import os
import subprocess
from pathlib import Path
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from services.common.store import Store, now
from services.common.errors import DomainError
from services.evidence.service import append

class Operation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node_ref: str = Field(min_length=1, max_length=200)
    operation: str = Field(min_length=1, max_length=100)
    script: str | None = Field(default=None, max_length=300)
    arguments: dict = Field(default_factory=dict, max_length=0)


def run_approved(command):
    if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
        raise DomainError('runner_config', 'Manifest command must be an argument array', 503)
    if not Path(command[0]).is_absolute():
        raise DomainError('runner_config', 'Manifest executable must use an absolute path', 503)
    result = subprocess.run(command, shell=False, capture_output=True, timeout=120,
                            env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, check=False)
    if result.returncode != 0:
        raise DomainError('operation_failed', 'Approved runner command failed', 502)
    if len(result.stdout) > 100000:
        raise DomainError('runner_response', 'Runner response is too large', 502)
    try:
        value = json.loads(result.stdout)
    except ValueError:
        raise DomainError('runner_response', 'Runner command must return JSON', 502)
    if not isinstance(value, dict):
        raise DomainError('runner_response', 'Runner command must return a JSON object', 502)
    return value


def create_runner():
    manifest = json.loads(Path(os.environ['RUNNER_MANIFEST']).read_text())
    token = Path(os.environ['RUNNER_TOKEN_FILE']).read_text().strip()
    if len(token) < 32:
        raise ValueError('Runner token must have at least 32 characters')
    store = Store(os.environ.get('RUNNER_DATABASE_URL', 'sqlite:///./runner.sqlite'))
    store.initialize()
    app = FastAPI(title='AEGIS scoped lab runner', docs_url=None, redoc_url=None)

    @app.exception_handler(DomainError)
    async def error(request, exc):
        return JSONResponse(exc.payload(), status_code=exc.status)

    @app.get('/health/live')
    def health():
        return {'status': 'ok'}

    @app.get('/health/ready')
    def ready():
        with store.transaction() as tx:
            tx.execute('SELECT 1')
        return {'status': 'ready'}

    @app.post('/v1/operations')
    def operation(body: Operation, authorization: str = Header(default=''), idempotency_key: str = Header(default='')):
        if not hmac.compare_digest(authorization, 'Bearer ' + token):
            raise DomainError('unauthorized', 'Runner authentication failed', 401)
        target = manifest.get('targets', {}).get(body.node_ref)
        if not target or 'lab' not in target.get('tags', []) or target.get('platform_host'):
            raise DomainError('unsafe_target', 'Target is not an approved lab node', 403)
        command_name = body.operation + (':' + body.script if body.script else '')
        entry = target.get('commands', {}).get(command_name)
        if not entry:
            raise DomainError('operation_denied', 'Operation is not approved in the runner manifest', 403)
        # Hash-pin every script/binary the manifest author chooses to verify.
        for path, expected in entry.get('sha256', {}).items():
            with open(path, 'rb') as file:
                if hashlib.file_digest(file, 'sha256').hexdigest() != expected:
                    raise DomainError('script_denied', 'Approved file hash changed', 403)
        read_only = body.operation.startswith('read.') or body.operation == 'scenario.check'
        if read_only:
            return run_approved(entry['argv'])
        if not idempotency_key or len(idempotency_key) > 200:
            raise DomainError('idempotency_required', 'Mutations require an idempotency key')
        digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        with store.transaction() as tx:
            existing = tx.execute('SELECT data,digest FROM jobs WHERE id=?', (idempotency_key,)).fetchone()
            if existing:
                if existing['digest'] != digest:
                    raise DomainError('idempotency_conflict', 'Operation key was reused', 409)
                value = json.loads(existing['data'])
                if value['state'] == 'completed':
                    return value['result']
                raise DomainError('needs_reconciliation', 'Previous operation did not complete cleanly; inspect the target', 409)
            tx.execute('INSERT INTO jobs(id,client_id,actor,idem,digest,data) VALUES(?,?,?,?,?,?)',
                       (idempotency_key, target['client_id'], 'runner', idempotency_key, digest,
                        json.dumps({'state': 'running', 'created_at': now()})))
            append(tx, target['client_id'], None, 'adapter.request', {'operation': command_name, 'node_ref': body.node_ref})
        try:
            result = run_approved(entry['argv'])
        except Exception:
            with store.transaction() as tx:
                tx.execute('UPDATE jobs SET data=? WHERE id=?', (json.dumps({'state': 'failed'}), idempotency_key))
                append(tx, target['client_id'], None, 'adapter.failed', {'operation': command_name, 'node_ref': body.node_ref})
            raise DomainError('operation_failed', 'Runner operation failed; target reconciliation may be required', 502)
        with store.transaction() as tx:
            tx.execute('UPDATE jobs SET data=? WHERE id=?',
                       (json.dumps({'state': 'completed', 'result': result}), idempotency_key))
            append(tx, target['client_id'], None, 'adapter.completed', {'operation': command_name, 'node_ref': body.node_ref})
        return result
    return app
