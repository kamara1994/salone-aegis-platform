import hmac
import time
from services.common.errors import DomainError
from services.common.security import Principal
from services.common.seed import CLIENTS

class Auth:
    def __init__(self, settings):
        self.settings = settings
        self.jwks = None

    def authenticate(self, token):
        if not token or len(token) > 16384:
            raise DomainError('unauthorized', 'A valid access token is required', 401)
        if self.settings.auth_mode == 'dev':
            if not hmac.compare_digest(token.encode('utf-8'), self.settings.dev_token.encode('utf-8')):
                raise DomainError('unauthorized', 'Invalid access token', 401)
            return Principal('00000000-0000-4000-8000-000000000001', ['admin', 'operator'], CLIENTS, int(time.time()) + 3600)
        import jwt
        try:
            if self.jwks is None:
                self.jwks = jwt.PyJWKClient(self.settings.oidc_jwks_url, cache_keys=True, lifespan=300, timeout=5)
            key = self.jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=['RS256'], audience=self.settings.oidc_audience,
                                issuer=self.settings.oidc_issuer,
                                options={'require': ['exp', 'iat', 'sub', 'iss', 'aud']})
            realm = claims.get('realm_access', {})
            if not isinstance(realm, dict):
                raise ValueError()
            roles = realm.get('roles', [])
            if not isinstance(roles, list) or any(not isinstance(r, str) for r in roles):
                raise ValueError()
            clients = claims.get('client_ids', [])
            if not isinstance(clients, list) or any(not isinstance(c, str) for c in clients):
                raise ValueError()
            principal = Principal(claims['sub'], roles, clients, claims['exp'])
            principal.require()
            return principal
        except (jwt.PyJWTError, ValueError, KeyError, TypeError):
            raise DomainError('unauthorized', 'Access token is invalid or expired', 401)
