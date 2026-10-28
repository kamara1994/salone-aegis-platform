import unittest
from pathlib import Path
from tests import test_domain as domain
ROOT = domain.ROOT
from services.ai import service as ai  # noqa: E402
from services.common.errors import DomainError  # noqa: E402
from services.orchestrator.scenarios import load, validate  # noqa: E402

class AuditRegressions(unittest.TestCase):
    setUp = domain.BackendTests.setUp
    tearDown = domain.BackendTests.tearDown
    submit = domain.BackendTests.submit
    run_job = domain.BackendTests.run_job
    launch = domain.BackendTests.launch
    investigate = domain.BackendTests.investigate

    def test_unicode_identity_answers_do_not_crash(self):
        ticket = self.launch()
        with self.store.transaction() as tx:
            persona = tx.get('persona', ticket['reporter_persona_id'])
            persona['verify_identity_answers'] = {'phrase': 'Café Freetown'}
            tx.put('persona', persona)
            self.assertTrue(ai.identity(tx, ticket, {'phrase': 'café freetown'}, self.actor)['verified'])

    def test_empty_identity_configuration_never_verifies(self):
        ticket = self.launch()
        with self.store.transaction() as tx:
            persona = tx.get('persona', ticket['reporter_persona_id'])
            persona['verify_identity_answers'] = {}
            tx.put('persona', persona)
            self.assertFalse(ai.identity(tx, ticket, {}, self.actor)['verified'])

    def test_multi_node_action_ids_are_distinct_and_stable(self):
        calls = []
        with self.store.transaction() as tx:
            nodes = tx.list('node', self.cid)
            for adapter in self.registry.adapters.values():
                adapter.action = lambda node, action, operation_id, args: calls.append(operation_id) or {'completed': True}
            job = {'id': 'restore-job', 'actor': self.actor, 'payload': {}}
            for _ in range(2):
                for node in nodes:
                    self.engine.perform(tx, node, 'revert', job)
        self.assertEqual(len(set(calls[:2])), 2)
        self.assertEqual(calls[:2], calls[2:])

    def test_lifecycle_ids_are_distinct_between_runs(self):
        calls = []
        ticket = self.launch()
        with self.store.transaction() as tx:
            run = tx.get('run', ticket['scenario_run_id'])
            adapter = self.registry.adapters['active_directory']
            adapter.lifecycle = lambda node, phase, script, op: calls.append(op) or {'applied': True}
            job = {'id': 'restore-job', 'actor': self.actor, 'payload': {}}
            self.engine.lifecycle(tx, run, 'cleanup', job)
            another = {**run, 'id': 'another-run'}
            self.engine.lifecycle(tx, another, 'cleanup', job)
        self.assertEqual(len(set(calls)), 2)

    def test_cleanup_attempts_remaining_targets_after_failure(self):
        calls = []
        ticket = self.launch()
        with self.store.transaction() as tx:
            run = tx.get('run', ticket['scenario_run_id'])
            firewall = next(n for n in tx.list('node', self.cid) if n['name'] == 'fw-01')
            run['targets']['fw-01'] = firewall['id']
            run['definition']['cleanup'].append({'target': 'fw-01', 'run': 'scripts/restore.ps1'})
            def broken(node, phase, script, op):
                calls.append(node['name'])
                raise RuntimeError('First target unavailable')
            def healthy(node, phase, script, op):
                calls.append(node['name'])
                return {'applied': True}
            self.registry.adapters['active_directory'].lifecycle = broken
            self.registry.adapters['opnsense'].lifecycle = healthy
            with self.assertRaises(Exception):
                self.engine.lifecycle(tx, run, 'cleanup', {'id': 'cleanup-job', 'actor': self.actor, 'payload': {}})
        self.assertEqual(calls, ['ws-fin-02', 'fw-01'])

    def test_pending_verification_cannot_be_manually_bypassed(self):
        ticket = self.launch()
        self.investigate(ticket)
        self.submit('ticket.resolve', {'ticket_id': ticket['id']}, 'verify')
        with self.store.transaction() as tx:
            current = tx.get('ticket', ticket['id'])
            with self.assertRaises(DomainError):
                self.engine.patch_ticket(tx, current, {'status': 'investigating'}, self.actor)

    def test_scenario_slug_must_match_its_pack_folder(self):
        pack = load(ROOT / 'scenarios')[0]
        pack['slug'] = '../another-pack'
        with self.assertRaises(ValueError):
            validate(pack, ROOT / 'scenarios/net-gateway-wrong')

    def test_unallowlisted_read_tool_fails_pack_validation(self):
        pack = load(ROOT / 'scenarios')[0]
        pack['client_facts'][0]['tool'] = 'write.password'
        with self.assertRaises(ValueError):
            validate(pack, ROOT / 'scenarios/net-gateway-wrong')

    def test_duplicate_pack_ids_are_rejected(self):
        import shutil
        folder = Path(self.tmp.name) / 'scenarios'
        shutil.copytree(ROOT / 'scenarios', folder)
        duplicate = folder / 'duplicate'
        shutil.copytree(folder / 'net-gateway-wrong', duplicate)
        source = (duplicate / 'scenario.yaml').read_text().replace('slug: net-gateway-wrong', 'slug: duplicate')
        (duplicate / 'scenario.yaml').write_text(source)
        with self.assertRaises(ValueError):
            load(folder)

    def test_no_resolve_job_for_aborted_scenario(self):
        ticket = self.launch()
        self.investigate(ticket)
        self.run_job(self.submit('scenario.abort', {'run_id': ticket['scenario_run_id']}, 'abort'))
        with self.assertRaises(DomainError):
            self.submit('ticket.resolve', {'ticket_id': ticket['id']}, 'verify')

    def test_record_identity_is_never_written_into_the_api_error(self):
        ticket = self.launch()
        with self.store.transaction() as tx:
            result = ai.identity(tx, ticket, {'employee_code': 'private-秘密'}, self.actor)
            self.assertFalse(result['verified'])


    def test_unconfirmed_action_is_not_reported_completed(self):
        with self.store.transaction() as tx:
            node = tx.list('node', self.cid)[0]
        self.registry.get(node).action = lambda *args: {'submitted': True}
        job = self.run_job(self.submit('node.action', {'node_id': node['id'], 'action': 'start'}))
        self.assertEqual(job['state'], 'needs_reconciliation')
        with self.store.transaction() as tx:
            events, _ = tx.events(0, [self.cid])
            self.assertFalse(any(e['type'] == 'job.completed' for e in events))

    def test_lifecycle_requires_positive_completion(self):
        self.registry.adapters['active_directory'].lifecycle = lambda *args: {'applied': False}
        result = self.run_job(self.submit('scenario.launch', {'scenario_id': self.scenario}))
        self.assertEqual(result['state'], 'failed')
        with self.store.transaction() as tx:
            self.assertEqual(tx.list('ticket'), [])
            self.assertEqual(tx.list('run')[0]['state'], 'cleanup_failed')

    def test_baseline_attempts_every_node_after_one_fails(self):
        calls = []
        with self.store.transaction() as tx:
            nodes = tx.list('node', self.cid)
        def broken(node, action, op, args):
            calls.append(node['id'])
            raise RuntimeError('offline')
        def successful(node, action, op, args):
            calls.append(node['id'])
            return {'completed': True}
        self.registry.get(nodes[0]).action = broken
        self.registry.get(nodes[1]).action = successful
        token = self.tokens.issue(self.actor, self.cid, 'baseline.restore')
        result = self.run_job(self.submit('baseline.restore', {'confirmation_token': token}))
        self.assertEqual(result['state'], 'failed')
        self.assertEqual(calls, [n['id'] for n in nodes])
        with self.store.transaction() as tx:
            self.assertTrue(tx.list('maintenance', self.cid)[0]['active'])

    def test_client_health_summary_is_scoped(self):
        from services.api.projections import client_detail
        with self.store.transaction() as tx:
            client = tx.get('client', self.cid)
            result = client_detail(tx, client)
            self.assertEqual(result['health_summary']['total_nodes'], 2)
            self.assertEqual(result['health_summary']['healthy'], 2)

    def test_node_details_include_related_ticket_without_private_state(self):
        from services.api.projections import node_detail
        ticket = self.launch()
        with self.store.transaction() as tx:
            node = next(n for n in tx.list('node', self.cid) if n['name'] == 'ws-fin-02')
            result = node_detail(tx, node)
            self.assertEqual(result['open_tickets'][0]['id'], ticket['id'])
            self.assertEqual(result['ips'], [node['mgmt_ip']])
            self.assertIn('specs', result)
            self.assertIn('recent_alerts', result)
            self.assertNotIn('baseline', result)
            self.assertNotIn('lab_state', result)
            other = node_detail(tx, tx.list('node', self.other)[0])
            self.assertEqual(other['open_tickets'], [])

    def test_unicode_bearer_token_is_rejected_without_crashing(self):
        from services.api.auth import Auth
        from services.common.config import Settings
        auth = Auth(Settings(auth_mode='dev', dev_token='x' * 40))
        with self.assertRaises(DomainError) as ctx:
            auth.authenticate('invalid-秘密')
        self.assertEqual(ctx.exception.status, 401)

    def test_production_rejects_cleartext_jwks(self):
        from services.common.config import Settings
        with self.assertRaises(ValueError):
            Settings(environment='production', auth_mode='oidc', confirmation_secret='x' * 40).validate()

if __name__ == '__main__':
    unittest.main()
