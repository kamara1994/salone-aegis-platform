"""HTTP/WebSocket tests; run with requirements-dev installed."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

AVAILABLE = importlib.util.find_spec('fastapi') is not None and importlib.util.find_spec('httpx') is not None

@unittest.skipUnless(AVAILABLE, 'FastAPI/httpx dependencies are unavailable in this execution environment')
class APITests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from services.common.config import Settings
        from services.common.store import Store
        from services.common.seed import seed, CLIENTS
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store('sqlite:///' + str(Path(self.temp.name) / 'test.sqlite'))
        self.store.initialize()
        seed(self.store, Path(__file__).resolve().parents[1] / 'scenarios')
        self.settings = Settings(
            database_url=self.store.url,
            redis_url='',
            auth_mode='dev',
            dev_token='test-' * 10,
            confirmation_secret='secret-' * 10,
        )
        self.app = create_app(self.settings, self.store)
        self.client = TestClient(self.app)
        self.cid = CLIENTS[0]
        self.headers = {'Authorization': 'Bearer ' + self.settings.dev_token}

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def call(self, method, path, body=None, key=None):
        headers = {**self.headers, 'Idempotency-Key': key or str(uuid4())}
        response = self.client.request(method, '/api/v1' + path, headers=headers, json=body)
        if os.getenv('VALIDATE_CONTRACTS') == '1':
            from scripts.capture_contracts import verify_response
            verify_response(method, '/api/v1' + path, response.status_code, response.json())
        return response

    def test_auth_required(self):
        for path in ('/me', '/clients', '/tickets', '/scenarios'):
            response = self.client.get('/api/v1' + path)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(set(response.json()), {'error'})

    def test_health(self):
        self.assertEqual(self.client.get('/health/live').status_code, 200)
        self.assertEqual(self.client.get('/health/ready').status_code, 200)

    def test_clients_pagination(self):
        response = self.call('GET', '/clients?limit=1')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body['items']), 1)
        other = self.call('GET', '/clients?cursor=' + body['next_cursor']).json()
        self.assertEqual(len(other['items']), 1)
        self.assertNotEqual(body['items'][0]['id'], other['items'][0]['id'])

    def test_validation_and_unknown_fields(self):
        response = self.call('POST', '/scenario-runs', {'client_id': 'not-a-uuid', 'admin': True})
        self.assertEqual(response.status_code, 422)
        self.assertIn('error', response.json())

    def test_unknown_resource(self):
        self.assertEqual(self.call('GET', '/clients/' + str(uuid4())).status_code, 404)

    def test_bad_cursor(self):
        self.assertEqual(self.call('GET', '/clients?cursor=garbage').status_code, 400)

    def launch(self):
        scenario = self.call('GET', '/scenarios').json()['items'][0]
        response = self.call('POST', '/scenario-runs', {'client_id': self.cid, 'scenario_id': scenario['id']})
        self.assertEqual(response.status_code, 202, response.text)
        self.app.state.engine.run_once()
        job = self.call('GET', '/jobs/' + response.json()['job_id']).json()
        self.assertEqual(job['state'], 'completed')
        return job['result']['ticket_id']

    def test_http_complete_loop(self):
        ticket = self.launch()
        for status in ('acknowledged', 'investigating'):
            self.assertEqual(self.call('PATCH', '/tickets/' + ticket, {'status': status}).status_code, 200)
        response = self.call('POST', '/tickets/' + ticket + '/resolve')
        self.assertEqual(response.status_code, 202)
        self.app.state.engine.run_once()
        self.assertEqual(self.call('GET', '/tickets/' + ticket).json()['status'], 'investigating')
        topology = self.call('GET', '/topology?client_id=' + self.cid).json()
        node = next(n for n in topology['nodes'] if n['name'] == 'ws-fin-02')
        self.call('POST', '/nodes/' + node['id'] + '/actions', {'action': 'start', 'arguments': {'gateway': '10.10.20.1'}})
        self.app.state.engine.run_once()
        self.call('POST', '/tickets/' + ticket + '/resolve')
        self.app.state.engine.run_once()
        self.assertEqual(self.call('GET', '/tickets/' + ticket).json()['status'], 'verified')
        self.call('PATCH', '/tickets/' + ticket, {'status': 'client_explanation'})
        response = self.call('POST', '/tickets/' + ticket + '/chat', {'body': 'Your computer had an incorrect network setting. I corrected it and confirmed that you can reach the application again.'})
        self.assertEqual(response.status_code, 202)
        self.app.state.engine.run_once()
        debrief = self.call('GET', '/tickets/' + ticket + '/debrief').json()
        for _ in debrief['questions']:
            response = self.call('POST', '/debriefs/' + debrief['id'] + '/answers',
                                 {'body': 'Gateway route baseline test verify evidence arp dhcp. I checked the network configuration and documented all changes and the observed results.'})
            self.assertEqual(response.status_code, 202)
            self.app.state.engine.run_once()
        self.assertEqual(self.call('GET', '/tickets/' + ticket).json()['status'], 'closed')
        self.assertTrue(self.call('GET', '/replay/' + ticket).json()['timeline'])
        self.assertTrue(self.call('GET', '/scorecards?client_id=' + self.cid).json()['skills'])

    def test_websocket_replay(self):
        self.launch()
        with self.store.transaction() as tx:
            expected, _ = tx.events(0, [self.cid])
        with self.client.websocket_connect('/api/v1/events') as ws:
            ws.send_json({'token': self.settings.dev_token, 'client_ids': [self.cid], 'after_seq': expected[0]['seq']})
            actual = ws.receive_json()
            self.assertEqual(actual, expected[1])
            if os.getenv('VALIDATE_CONTRACTS') == '1':
                from scripts.capture_contracts import verify_event
                for event in expected:
                    verify_event(event)

    def test_fake_console_is_explicitly_unavailable(self):
        node = self.call('GET', '/topology?client_id=' + self.cid).json()['nodes'][0]
        response = self.call('POST', '/nodes/' + node['id'] + '/console-sessions', {'protocol': 'ssh'})
        self.assertEqual(response.status_code, 503)

    def test_duplicate_chat_has_one_operator_message(self):
        ticket = self.launch()
        for _ in range(2):
            self.call('POST', '/tickets/' + ticket + '/chat', {'body': 'hello'}, key='same')
        messages = self.call('GET', '/tickets/' + ticket + '/chat').json()['items']
        self.assertEqual(sum(m['author'] == 'operator' for m in messages), 1)

    def test_openapi_contains_all_blueprint_operations(self):
        paths = self.app.openapi()['paths']
        for path in ['/me', '/clients', '/clients/{identifier}', '/topology', '/nodes/{identifier}',
                     '/nodes/{identifier}/actions', '/nodes/{identifier}/console-sessions', '/tickets',
                     '/tickets/{identifier}', '/tickets/{identifier}/resolve', '/tickets/{identifier}/chat',
                     '/tickets/{identifier}/chat/verify-identity', '/scenarios', '/scenario-runs',
                     '/scenario-runs/{identifier}/hint', '/scenario-runs/{identifier}/abort',
                     '/tickets/{identifier}/debrief', '/debriefs/{identifier}/answers',
                     '/debriefs/{identifier}/defer', '/evidence', '/scorecards', '/flows', '/replay/{identifier}',
                     '/lab/baseline/restore', '/notifications', '/notifications/{identifier}/ack']:
            self.assertIn('/api/v1' + path, paths)
