"""Compose acceptance smoke: real Keycloak, API, Postgres and background workers."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def call(url, data=None, token=None, key=None, form=False, method=None):
    headers = {'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if key:
        headers['Idempotency-Key'] = key
    encoded = (urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()) if data is not None else None
    with urllib.request.urlopen(urllib.request.Request(url, encoded, headers, method=method), timeout=10) as response:
        return json.load(response)


def main():
    env = dict(line.split('=', 1) for line in Path('.env').read_text().splitlines() if '=' in line)
    deadline = time.monotonic() + 180
    token = None
    while time.monotonic() < deadline:
        try:
            call('http://localhost:8000/health/ready')
            token = call('http://localhost:8080/realms/aegis/protocol/openid-connect/token',
                         {'grant_type': 'password', 'client_id': 'aegis-api', 'username': 'joe',
                          'password': env['DEMO_OPERATOR_PASSWORD']}, form=True)['access_token']
            break
        except (urllib.error.URLError, KeyError):
            time.sleep(2)
    if not token:
        raise SystemExit('API or Keycloak did not become ready')
    api = 'http://localhost:8000/api/v1'
    clients = call(api + '/clients', token=token)['items']
    assert len(clients) == 2
    scenario = call(api + '/scenarios', token=token)['items'][0]
    job = call(api + '/scenario-runs', {'client_id': clients[0]['id'], 'scenario_id': scenario['id']}, token, 'smoke-launch')
    for _ in range(60):
        result = call(api + '/jobs/' + job['job_id'], token=token)
        if result['state'] in ('completed', 'failed'):
            assert result['state'] == 'completed', result
            print('Compose smoke passed: Keycloak login, two tenants, scenario injection and durable worker job.')
            return
        time.sleep(1)
    raise SystemExit('Scenario job did not complete')

if __name__ == '__main__':
    main()
