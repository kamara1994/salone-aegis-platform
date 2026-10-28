"""Single-use connection grants and scoped Guacamole JSON-auth exchange.
The encrypted assertion remains server-side. Browser receives a scoped Guacamole
session token only after redeeming its one-use 5-minute AEGIS grant.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from services.common.errors import DomainError
from .base import guard
from .live import LiveAdapter, request


def sign_assertion(data, secret_hex):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.padding import PKCS7
    key = bytes.fromhex(secret_hex)
    if len(key) != 16:
        raise DomainError('adapter_config', 'Guacamole JSON key must be 128 bits', 503)
    body = json.dumps(data, separators=(',', ':')).encode()
    signed = hmac.new(key, body, hashlib.sha256).digest() + body
    padder = PKCS7(128).padder()
    padded = padder.update(signed) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(bytes(16))).encryptor()
    return base64.b64encode(encryptor.update(padded) + encryptor.finalize()).decode()


class GuacamoleAdapter(LiveAdapter):
    def session(self, node, protocol, actor):
        guard(node)
        config = self.vault.credentials('guacamole')
        target = config['targets'].get(node['platform_ref'], {}).get(protocol)
        if not target:
            raise DomainError('console_unavailable', 'Console protocol is not provisioned for this node', 503)
        if target['protocol'] not in ('ssh', 'rdp', 'vnc'):
            raise DomainError('adapter_config', 'Serial consoles must be mapped through an approved SSH console server', 503)
        assertion = {'username': actor, 'expires': int(time.time() * 1000) + 30000,
                     'connections': {node['id']: {'protocol': target['protocol'], 'parameters': target['parameters']}}}
        encrypted = sign_assertion(assertion, config['json_secret_key'])
        session = request(config['url'].rstrip('/') + '/api/tokens', 'POST', {'data': encrypted}, form=True)
        if not isinstance(session.get('authToken'), str):
            raise DomainError('broker_response', 'Guacamole rejected the connection', 502)
        return {'url': config['public_url'].rstrip('/') + '/websocket-tunnel', 'token': session['authToken'],
                'data_source': session.get('dataSource', 'json'), 'connection_id': node['id'],
                'protocol': target['protocol']}


class ConsoleBroker:
    def __init__(self, redis):
        self.redis = redis

    @staticmethod
    def key(token):
        return 'console:' + hashlib.sha256(token.encode()).hexdigest()

    def issue(self, node, protocol, actor):
        guard(node)
        token = secrets.token_urlsafe(32)
        value = {'node_id': node['id'], 'client_id': node['client_id'], 'protocol': protocol, 'actor': actor}
        self.redis.set(self.key(token), json.dumps(value), ex=300, nx=True)
        return {'url': '/api/v1/console-sessions/connect', 'token': token, 'expires_in': 300}

    def redeem(self, token, actor):
        # Validate owner and atomically consume so two connections cannot win a race.
        script = '''local raw=redis.call('GET', KEYS[1]); if not raw then return nil end;
        local value=cjson.decode(raw); if value.actor ~= ARGV[1] then return nil end;
        redis.call('DEL', KEYS[1]); return raw'''
        result = self.redis.eval(script, 1, self.key(token), actor)
        if not result:
            raise DomainError('invalid_token', 'Console token is invalid, expired, used or belongs to another operator', 403)
        return json.loads(result)
