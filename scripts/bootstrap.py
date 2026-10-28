"""Generate development-only secrets and Keycloak realm. Never print credentials."""
import json
import os
import secrets
from pathlib import Path
from services.common.seed import CLIENTS


def main():
    env = Path('.env')
    realm_path = Path('infra/keycloak/realm.json')
    if env.exists() or realm_path.exists():
        raise SystemExit('Configuration already exists; refusing to replace secrets or realm users')
    values = {name: secrets.token_urlsafe(36) for name in (
        'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD',
        'DEMO_OPERATOR_PASSWORD', 'DEV_TOKEN', 'CONFIRMATION_SECRET', 'MINIO_ROOT_PASSWORD')}
    values.update(ENVIRONMENT='development', AUTH_MODE='oidc', ADAPTER_MODE='fake',
                  LLM_MODE='deterministic', OIDC_ISSUER='http://localhost:8080/realms/aegis',
                  OIDC_AUDIENCE='aegis-api', SCENARIO_DIR='scenarios')
    descriptor = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as file:
        file.write('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
    realm = {'realm': 'aegis', 'enabled': True, 'registrationAllowed': False,
             'roles': {'realm': [{'name': role} for role in ('admin', 'operator', 'viewer')]},
             'clients': [{'clientId': 'aegis-api', 'enabled': True, 'publicClient': True,
                          'directAccessGrantsEnabled': True, 'standardFlowEnabled': True,
                          'redirectUris': ['http://localhost:3000/*'], 'webOrigins': ['http://localhost:3000'],
                          'protocolMappers': [
                              {'name': 'audience', 'protocol': 'openid-connect', 'protocolMapper': 'oidc-audience-mapper',
                               'config': {'included.client.audience': 'aegis-api', 'access.token.claim': 'true'}},
                              {'name': 'client_ids', 'protocol': 'openid-connect', 'protocolMapper': 'oidc-usermodel-attribute-mapper',
                               'config': {'user.attribute': 'client_ids', 'claim.name': 'client_ids',
                                          'jsonType.label': 'String', 'multivalued': 'true', 'access.token.claim': 'true'}}]}],
             'users': [{'username': 'joe', 'enabled': True, 'emailVerified': True,
                        'firstName': 'Lab', 'lastName': 'Operator', 'email': 'joe@example.invalid',
                        'realmRoles': ['operator', 'admin'], 'attributes': {'client_ids': CLIENTS},
                        'credentials': [{'type': 'password', 'value': values['DEMO_OPERATOR_PASSWORD'], 'temporary': False}]}]}
    realm_path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(realm_path.parent, 0o700)
    descriptor = os.open(realm_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(descriptor, 'w') as file:
        json.dump(realm, file, indent=2)
    print('Generated .env and development Keycloak realm. Run docker compose up --build.')

if __name__ == '__main__':
    main()
