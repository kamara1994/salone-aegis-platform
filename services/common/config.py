import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'sqlite:///./aegis.sqlite')
    redis_url: str = os.getenv('REDIS_URL', '')
    auth_mode: str = os.getenv('AUTH_MODE', 'oidc')
    dev_token: str = os.getenv('DEV_TOKEN', '')
    oidc_issuer: str = os.getenv('OIDC_ISSUER', 'http://localhost:8080/realms/aegis')
    oidc_jwks_url: str = os.getenv('OIDC_JWKS_URL', 'http://keycloak:8080/realms/aegis/protocol/openid-connect/certs')
    oidc_audience: str = os.getenv('OIDC_AUDIENCE', 'aegis-api')
    adapter_mode: str = os.getenv('ADAPTER_MODE', 'fake')
    llm_mode: str = os.getenv('LLM_MODE', 'deterministic')
    scenario_dir: str = os.getenv('SCENARIO_DIR', 'scenarios')
    confirmation_secret: str = os.getenv('CONFIRMATION_SECRET', '')
    environment: str = os.getenv('ENVIRONMENT', 'development')

    def validate(self):
        if self.auth_mode not in ('oidc', 'dev'):
            raise ValueError('AUTH_MODE must be oidc or dev')
        if self.llm_mode not in ('deterministic', 'openai-compatible'):
            raise ValueError('LLM_MODE must be deterministic or openai-compatible')
        if self.environment != 'development' and self.auth_mode == 'oidc':
            if not self.oidc_issuer.startswith('https://') or not self.oidc_jwks_url.startswith('https://'):
                raise ValueError('Production OIDC issuer and JWKS must use HTTPS')
        if self.adapter_mode not in ('fake', 'live'):
            raise ValueError('ADAPTER_MODE must be fake or live')
        if self.environment != 'development' and self.auth_mode == 'dev':
            raise ValueError('Development authentication is forbidden outside development')
        if self.auth_mode == 'dev' and len(self.dev_token) < 32:
            raise ValueError('DEV_TOKEN must contain at least 32 characters')
        if len(self.confirmation_secret) < 32:
            raise ValueError('CONFIRMATION_SECRET must contain at least 32 characters')
