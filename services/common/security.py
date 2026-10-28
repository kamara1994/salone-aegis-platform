import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from services.common.errors import DomainError
from services.common.store import uid, now

@dataclass
class Principal:
    id: str
    roles: list[str]
    client_ids: list[str]
    expires_at: int = 0

    def require(self, client_id=None, write=False, admin=False):
        if client_id is not None and client_id not in self.client_ids:
            raise DomainError('not_found', 'Record not found', 404)
        if not set(self.roles) & {'viewer', 'operator', 'admin'}:
            raise DomainError('forbidden', 'Platform role required', 403)
        if admin and 'admin' not in self.roles:
            raise DomainError('forbidden', 'Administrator role required', 403)
        if write and not set(self.roles) & {'admin', 'operator'}:
            raise DomainError('forbidden', 'Write access required', 403)

class ConfirmationTokens:
    def __init__(self, secret):
        if len(secret) < 32:
            raise ValueError('A strong confirmation secret is required')
        self.secret = secret.encode()

    def issue(self, actor, client_id, purpose, ttl=300):
        payload = {'actor': actor, 'client_id': client_id, 'purpose': purpose,
                   'exp': int(time.time()) + ttl, 'nonce': uid()}
        body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
        sig = hmac.new(self.secret, body.encode(), hashlib.sha256).hexdigest()
        return body + '.' + sig

    def consume(self, tx, token, actor, client_id, purpose):
        try:
            body, sig = token.split('.')
            expected = hmac.new(self.secret, body.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected):
                raise ValueError()
            data = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
            if data['exp'] <= time.time() or (data['actor'], data['client_id'], data['purpose']) != (actor, client_id, purpose):
                raise ValueError()
            if tx.execute('SELECT nonce FROM consumed_tokens WHERE nonce=?', (data['nonce'],)).fetchone():
                raise ValueError()
            tx.execute('INSERT INTO consumed_tokens(nonce,used_at) VALUES(?,?)', (data['nonce'], now()))
        except (ValueError, KeyError, TypeError):
            raise DomainError('invalid_token', 'Token is invalid, expired, already used, or incorrectly scoped', 403)
