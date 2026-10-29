import tempfile
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from services.common.store import Store
from services.common.security import Principal, ConfirmationTokens
from services.common.errors import DomainError
from services.evidence.service import records, verify_chain
from services.lab.domain import Topology, revision, snapshot, get
from services.lab.sessions import Sessions
from services.lab.simulation import trace


@pytest.fixture
def lab():
    with tempfile.TemporaryDirectory() as directory:
        store = Store('sqlite:///' + directory + '/lab.db')
        store.initialize()
        cid = str(uuid4())
        actor = Principal(str(uuid4()), ['admin'], [cid])
        tokens = ConfirmationTokens('test-secret-for-lab-grants-' * 3)
        engine = Topology(store, Sessions(tokens))
        yield Harness(store, cid, actor, engine, tokens)


class Harness:
    def __init__(self, store, cid, actor, engine, tokens):
        self.store, self.cid, self.actor, self.engine, self.tokens = store, cid, actor, engine, tokens

    def revision(self):
        with self.store.transaction() as tx:
            return revision(tx, self.cid)

    def run(self, op, payload, **kwargs):
        return self.engine.execute(kwargs.get('actor', self.actor), self.cid, kwargs.get('key', str(uuid4())),
                                   kwargs.get('revision', self.revision()), op, payload)

    def create(self, kind, **data):
        return self.run('create', {'kind': kind, 'data': data})['result']

    def network(self):
        model = self.create('device-models', name='Linux', role='host', platform='linux', protocols=['ssh'])
        a, b = [self.create('devices', name=n, model_id=model['id']) for n in ('a', 'b')]
        pa, pb = [self.create('interfaces', name='eth0', device_id=d['id'], address=ip)
                  for d, ip in ((a, '10.0.0.1/24'), (b, '10.0.0.2/24'))]
        ct = self.create('cable-types', name='Copper crossover', medium='copper', wiring='crossover')
        return a, b, pa, pb, ct

    def connect(self, pa, pb, ct):
        return self.create('cables', a=pa['id'], b=pb['id'], type_id=ct['id'])


def test_valid_connection_and_trace(lab):
    a, b, pa, pb, ct = lab.network()
    lab.connect(pa, pb, ct)
    with lab.store.transaction() as tx:
        one = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        two = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        assert one == two
        assert one['success'] and one['latency_ms'] == 1
        assert one['hops'][-1]['device_id'] == b['id']
        assert verify_chain(records(tx, lab.cid))


@pytest.mark.parametrize('change,code', [({'duplex': 'half'}, 'duplex_mismatch'),
    ({'speed': 100}, 'speed_mismatch'), ({'enabled': False}, 'interface_shutdown'),
    ({'vlans': [2], 'native_vlan': 2}, 'vlan_mismatch'), ({'port_type': 'fiber'}, 'port_type'),
    ({'mode': 'trunk'}, 'mode_mismatch')])
def test_invalid_connection_rolls_back(lab, change, code):
    _, _, pa, pb, ct = lab.network()
    lab.run('update', {'kind': 'interfaces', 'id': pb['id'], 'version': pb['version'], 'data': change})
    with lab.store.transaction() as tx:
        before, audit = snapshot(tx, lab.cid), records(tx, lab.cid)
    rev = lab.revision()
    with pytest.raises(DomainError) as rejected:
        lab.connect(pa, pb, ct)
    assert code in [e['code'] for e in rejected.value.details['violations']]
    with lab.store.transaction() as tx:
        assert snapshot(tx, lab.cid) == before
        assert records(tx, lab.cid) == audit
    assert lab.revision() == rev


def test_occupancy_and_wrong_wiring(lab):
    _, _, pa, pb, ct = lab.network()
    wrong = lab.create('cable-types', name='Straight', medium='copper', wiring='straight')
    with pytest.raises(DomainError, match='Cable connection'):
        lab.connect(pa, pb, wrong)
    lab.connect(pa, pb, ct)
    with pytest.raises(DomainError) as error:
        lab.connect(pa, pb, ct)
    assert error.value.details['violations'][0]['code'] == 'port_occupied'


def test_idempotency_and_optimistic_concurrency(lab):
    rev = lab.revision()
    payload = {'kind': 'sites', 'data': {'name': 'Office'}}
    first = lab.run('create', payload, key='same', revision=rev)
    assert first == lab.run('create', payload, key='same', revision=rev)
    with pytest.raises(DomainError) as err:
        lab.run('create', {'kind': 'sites', 'data': {'name': 'Different'}}, key='same', revision=rev)
    assert err.value.code == 'idempotency_conflict'
    with pytest.raises(DomainError) as err:
        lab.run('create', payload, revision=rev)
    assert err.value.code == 'version_conflict'


def test_racing_writes_have_one_winner(lab):
    rev = lab.revision()
    def write(index):
        try:
            return lab.run('create', {'kind': 'sites', 'data': {'name': str(index)}}, revision=rev)['state']
        except DomainError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(write, range(2))) == ['completed', 'version_conflict']


def test_tenant_and_role_isolation(lab):
    with pytest.raises(DomainError) as err:
        lab.run('create', {'kind': 'sites', 'data': {'name': 'Bad'}}, actor=Principal('other', ['admin'], []))
    assert err.value.status == 404
    with pytest.raises(DomainError) as err:
        lab.run('create', {'kind': 'sites', 'data': {'name': 'Bad'}}, actor=Principal('viewer', ['viewer'], [lab.cid]))
    assert err.value.status == 403


def config(items):
    return {k: [{f: v for f, v in item.items() if f not in ('version', 'updated_at')} for item in values]
            for k, values in items.items()}


def test_baseline_exact_configuration_and_version_fencing(lab):
    a, _, _, _, _ = lab.network()
    lab.run('baseline.save', {})
    with lab.store.transaction() as tx:
        before = snapshot(tx, lab.cid)
    lab.run('update', {'kind': 'devices', 'id': a['id'], 'version': 1, 'data': {'power': 'off'}})
    lab.create('sites', name='Temporary')
    lab.run('baseline.restore', {})
    with lab.store.transaction() as tx:
        assert config(snapshot(tx, lab.cid)) == config(before)
        assert get(tx, 'devices', a['id'], lab.cid)['version'] == 3


def test_fault_setup_check_solve_cleanup(lab):
    _, _, pa, _, _ = lab.network()
    fault = lab.run('fault.setup', {'name': 'shut_interface', 'target_id': pa['id'], 'value': False})['result']
    assert not lab.run('fault.check', {'id': fault['id'], 'version': 1})['result']['solved']
    lab.run('fault.solve', {'id': fault['id'], 'version': 1})
    assert lab.run('fault.check', {'id': fault['id'], 'version': 2})['result']['solved']
    lab.run('fault.cleanup', {'id': fault['id'], 'version': 2})
    with lab.store.transaction() as tx:
        restored = get(tx, 'interfaces', pa['id'], lab.cid)
        assert {k: v for k, v in restored.items() if k not in ('version', 'updated_at')} == {k: v for k, v in pa.items() if k not in ('version', 'updated_at')}


def test_session_single_use_scope_and_expiry(lab):
    a, _, _, _, _ = lab.network()
    s = lab.run('session.open', {'device_id': a['id'], 'protocol': 'ssh'})['result']
    expired = lab.tokens.issue(lab.actor.id, lab.cid, 'lab.session:' + s['id'], ttl=-1)
    for token in (expired, lab.tokens.issue('other', lab.cid, 'lab.session:' + s['id'])):
        with pytest.raises(DomainError) as err:
            lab.run('session.connect', {'id': s['id'], 'version': 1, 'token': token})
        assert err.value.code == 'invalid_token'
    token = lab.engine.sessions.grant(s)
    lab.run('session.connect', {'id': s['id'], 'version': 1, 'token': token})
    with pytest.raises(DomainError):
        lab.run('session.connect', {'id': s['id'], 'version': 2, 'token': token})
    with pytest.raises(DomainError) as err:
        lab.run('session.command', {'id': s['id'], 'version': 2, 'command': 'rm -rf /'})
    assert err.value.code == 'command_forbidden'
    lab.run('session.command', {'id': s['id'], 'version': 2, 'command': 'show_health'})
    lab.run('session.terminate', {'id': s['id'], 'version': 3})
    with lab.store.transaction() as tx:
        assert token not in str(records(tx, lab.cid))
        assert get(tx, 'sessions', s['id'], lab.cid)['state'] == 'terminated'


def test_live_session_fails_closed(lab):
    a, _, _, _, _ = lab.network()
    lab.engine.sessions.mode = 'live'
    with pytest.raises(DomainError) as err:
        lab.run('session.open', {'device_id': a['id'], 'protocol': 'ssh'})
    assert err.value.code == 'live_console_unconfigured'


def test_event_replay_tenant_filter(lab):
    lab.create('sites', name='Office')
    with lab.store.transaction() as tx:
        events, last = tx.events(0, [lab.cid])
        assert events[-1]['type'] == 'job.completed'
        assert tx.events(last, [lab.cid])[0] == []
        assert tx.events(0, ['other'])[0] == []
        assert tx.events(0, [lab.cid])[0] == events


@pytest.mark.parametrize('change,reason', [({'fault': 'damaged'}, 'cable_damaged'), ({'loss_percent': 100}, 'packet_lost')])
def test_packet_cable_faults(lab, change, reason):
    a, _, pa, pb, ct = lab.network()
    cable = lab.connect(pa, pb, ct)
    lab.run('update', {'kind': 'cables', 'id': cable['id'], 'version': 1, 'data': change})
    with lab.store.transaction() as tx:
        result = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        assert not result['success'] and result['reason'] == reason


def test_lab_http_jobs_and_websocket_replay(lab):
    import json
    from pathlib import Path
    from fastapi.testclient import TestClient
    from jsonschema import Draft202012Validator
    from services.api.app import create_app
    from services.common.config import Settings
    from services.common.seed import CLIENTS
    lab.cid = CLIENTS[0]
    settings = Settings(redis_url='', auth_mode='dev', dev_token='test-token-' * 5, confirmation_secret='test-secret-' * 5)
    app = create_app(settings, lab.store)
    prefix = '/api/lab/v1/tenants/' + lab.cid
    headers = {'Authorization': 'Bearer ' + settings.dev_token, 'Idempotency-Key': 'http-create', 'If-Match': '0'}
    schema = json.loads((Path(__file__).parents[1] / 'contracts/events.schema.json').read_text())
    with TestClient(app) as client:
        assert client.post(prefix + '/objects/sites', json={'data': {'name': 'Office'}}).status_code == 401
        response = client.post(prefix + '/objects/sites', headers=headers, json={'data': {'name': 'Office'}})
        assert response.status_code == 202, response.text
        job = response.json()
        assert client.get('/api/v1/jobs/' + job['id'], headers=headers).json()['result']['name'] == 'Office'
        assert client.get(prefix + '/topology', headers=headers).json()['revision'] == 1
        assert client.post(prefix + '/objects/sites', headers=headers, json={'data': {'name': 'Office'}}).json() == job
        assert client.post(prefix + '/objects/sites', headers={**headers, 'Idempotency-Key': 'new'},
                           json={'data': {'name': 'Office'}}).status_code == 409
        with client.websocket_connect('/api/v1/events') as socket:
            socket.send_json({'token': settings.dev_token, 'after_seq': 0, 'topics': ['*'], 'client_ids': [lab.cid]})
            event = socket.receive_json()
            Draft202012Validator(schema).validate(event)
            assert event['data']['job_id'] == job['id']


def test_cross_tenant_foreign_keys(lab):
    _, _, pa, _, ct = lab.network()
    other = str(uuid4())
    actor = Principal('other', ['admin'], [other])
    job = lab.engine.execute(actor, other, 'model', 0, 'create', {'kind': 'device-models', 'data': {'name': 'Other', 'role': 'host'}})
    model = job['result']
    job = lab.engine.execute(actor, other, 'device', 1, 'create', {'kind': 'devices', 'data': {'name': 'Other', 'model_id': model['id']}})
    job = lab.engine.execute(actor, other, 'port', 2, 'create', {'kind': 'interfaces', 'data': {'name': 'eth0', 'device_id': job['result']['id']}})
    with pytest.raises(DomainError) as exc:
        lab.connect(pa, job['result'], ct)
    assert exc.value.status == 404


def test_firewall_dns_dhcp_and_power(lab):
    a, b, pa, pb, ct = lab.network()
    lab.connect(pa, pb, ct)
    lab.run('update', {'kind': 'devices', 'id': a['id'], 'version': 1, 'data': {'dns': {'example.lab': '10.0.0.2'}}})
    lab.run('update', {'kind': 'devices', 'id': b['id'], 'version': 1,
                       'data': {'rules': [{'action': 'deny', 'protocol': 'tcp', 'port': 443}]}})
    with lab.store.transaction() as tx:
        assert trace(tx, lab.cid, {'source_id': a['id'], 'destination': 'example.lab', 'protocol': 'tcp', 'port': 443})['reason'] == 'acl_denied'
        assert trace(tx, lab.cid, {'source_id': a['id'], 'destination': 'example.lab', 'protocol': 'tcp', 'port': 80})['success']
    lab.run('power', {'id': b['id'], 'version': 2, 'action': 'off'})
    with lab.store.transaction() as tx:
        assert trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})['reason'] == 'device_unavailable'
    lab.run('power', {'id': b['id'], 'version': 3, 'action': 'reboot'})
    vlan = lab.create('vlans', name='Default', tag=1)
    lab.create('subnets', name='LAN', cidr='10.0.0.0/24', vlan_id=vlan['id'], dhcp_start='10.0.0.10', dhcp_end='10.0.0.20', gateway='10.0.0.254')
    lab.run('update', {'kind': 'interfaces', 'id': pa['id'], 'version': 1, 'data': {'address': None, 'dhcp': True}})
    with lab.store.transaction() as tx:
        result = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        assert result['success'] and result['hops'][0]['source'] == '10.0.0.10'


def test_live_broker_uses_only_approved_binding_and_filters_output(lab):
    from services.adapters.lab_console import BrokerConsoleTransport
    a, _, _, _, _ = lab.network()
    config = {'url': 'https://broker.lab', 'public_url': 'https://console.lab', 'token': 'server-secret',
              'targets': {lab.cid + ':' + a['id']: {'platform_host': False, 'tags': ['lab'],
                          'platform': 'linux', 'protocols': ['ssh'], 'target_ref': 'approved-node'}}}
    class Vault:
        def credentials(self, system):
            assert system == 'console-broker'
            return config
    calls = []
    def sender(*args):
        calls.append(args)
        return {'completed': True, 'password': 'do-not-leak', 'token': 'do-not-leak'}
    transport = BrokerConsoleTransport(Vault(), sender)
    lab.engine.sessions.mode, lab.engine.sessions.transport = 'live', transport
    session = lab.run('session.open', {'device_id': a['id'], 'protocol': 'ssh'})['result']
    result = lab.run('session.connect', {'id': session['id'], 'version': 1, 'token': lab.engine.sessions.grant(session)})
    assert 'do-not-leak' not in str(result)
    assert calls[0][2]['target_ref'] == 'approved-node'
    with pytest.raises(DomainError):
        transport.validate(str(uuid4()), a['id'], 'ssh')
    config['targets'][lab.cid + ':' + a['id']]['platform_host'] = True
    with pytest.raises(DomainError):
        transport.validate(lab.cid, a['id'], 'ssh')
    assert len(calls) == 1


def test_scenario_lifecycle_is_versioned(lab):
    _, _, pa, _, _ = lab.network()
    run = lab.run('scenario.setup', {'name': 'shut_interface', 'target_id': pa['id'], 'value': False})['result']
    checked = lab.run('scenario.check', {'id': run['id'], 'version': 1})['result']
    assert checked['result']['solved'] is False
    lab.run('scenario.solve', {'id': run['id'], 'version': 2})
    cleaned = lab.run('scenario.cleanup', {'id': run['id'], 'version': 3})['result']
    assert cleaned['run']['state'] == 'cleaned'


def test_routed_packet_nat_and_next_hop_failure(lab):
    a, b, pa, pb, ct = lab.network()
    router_model = lab.create('device-models', name='Router', role='router', platform='ios')
    router = lab.create('devices', name='Gateway', model_id=router_model['id'], nat_ip='192.0.2.1')
    r1 = lab.create('interfaces', name='g0', device_id=router['id'], address='10.0.0.254/24')
    r2 = lab.create('interfaces', name='g1', device_id=router['id'], address='10.1.0.254/24')
    lab.run('update', {'kind': 'interfaces', 'id': pb['id'], 'version': 1, 'data': {'address': '10.1.0.2/24'}})
    lab.connect(pa, r1, ct)
    lab.connect(r2, pb, ct)
    route = lab.create('routes', device_id=a['id'], interface_id=pa['id'], network='0.0.0.0/0', next_hop='10.0.0.254')
    with lab.store.transaction() as tx:
        result = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.1.0.2'})
        assert result['success'], result
        assert any(h.get('nat', {}).get('to') == '192.0.2.1' for h in result['hops'])
    lab.run('update', {'kind': 'routes', 'id': route['id'], 'version': 1, 'data': {'next_hop': '10.0.0.99'}})
    with lab.store.transaction() as tx:
        assert trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.1.0.2'})['reason'] == 'arp_unresolved'


def test_ethernet_switch_forwards_and_blocks_vlan(lab):
    a, b, pa, pb, _ = lab.network()
    model = lab.create('device-models', name='Switch', role='switch', platform='ios')
    switch = lab.create('devices', name='SW1', model_id=model['id'])
    p1 = lab.create('interfaces', name='g1', device_id=switch['id'])
    p2 = lab.create('interfaces', name='g2', device_id=switch['id'])
    straight = lab.create('cable-types', name='Straight', medium='copper', wiring='straight')
    lab.connect(pa, p1, straight)
    lab.connect(pb, p2, straight)
    with lab.store.transaction() as tx:
        result = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        assert result['success'] and result['latency_ms'] == 2
        assert switch['id'] in [h['device_id'] for h in result['hops']]
    lab.run('fault.setup', {'name': 'wrong_vlan', 'target_id': p2['id'], 'value': [2]})
    with lab.store.transaction() as tx:
        result = trace(tx, lab.cid, {'source_id': a['id'], 'destination': '10.0.0.2'})
        assert not result['success'] and result['reason'] == 'vlan_blocked'


def test_rate_limit_includes_rejected_mutations(lab):
    for _ in range(120):
        with pytest.raises(DomainError) as exc:
            lab.run('create', {'kind': 'missing', 'data': {}})
        assert exc.value.code == 'unknown_kind'
    with pytest.raises(DomainError) as exc:
        lab.create('sites', name='Office')
    assert exc.value.status == 429


def test_serial_console_and_fiber_validation(lab):
    console_model = lab.create('device-models', name='Console', role='console_server')
    router_model = lab.create('device-models', name='Router', role='router')
    console = lab.create('devices', name='Console server', model_id=console_model['id'])
    router = lab.create('devices', name='Router', model_id=router_model['id'])
    serial = lab.create('interfaces', name='tty1', device_id=console['id'], port_type='serial')
    port = lab.create('interfaces', name='console', device_id=router['id'], port_type='console')
    rollover = lab.create('cable-types', name='Rollover', medium='console', wiring='rollover')
    assert lab.connect(serial, port, rollover)['id']
    p1 = lab.create('interfaces', name='sfp1', device_id=console['id'], port_type='fiber')
    p2 = lab.create('interfaces', name='sfp1', device_id=router['id'], port_type='fiber')
    wrong = lab.create('cable-types', name='Copper', medium='copper', wiring='crossover')
    with pytest.raises(DomainError) as exc:
        lab.connect(p1, p2, wrong)
    assert 'medium_mismatch' in [v['code'] for v in exc.value.details['violations']]
    fiber = lab.create('cable-types', name='Fiber', medium='fiber', wiring='fiber')
    assert lab.connect(p1, p2, fiber)['id']


@pytest.mark.parametrize('name', ['wrong_cable_type', 'wrong_port', 'unplugged_cable', 'shut_interface',
                                  'wrong_vlan', 'speed_mismatch', 'bad_route', 'firewall_block',
                                  'failed_device', 'failed_vm'])
def test_every_fault_restores_exact_configuration(lab, name):
    a, b, pa, pb, ct = lab.network()
    cable = lab.connect(pa, pb, ct)
    if name == 'wrong_cable_type':
        wrong = lab.create('cable-types', name='Wrong', medium='copper', wiring='straight')
        target, value = cable, wrong['id']
    elif name == 'wrong_port':
        wrong = lab.create('interfaces', name='eth1', device_id=b['id'])
        target, value = cable, wrong['id']
    elif name == 'unplugged_cable':
        target, value = cable, 'unplugged'
    elif name == 'shut_interface':
        target, value = pa, False
    elif name == 'wrong_vlan':
        target, value = pa, [2]
    elif name == 'speed_mismatch':
        target, value = pa, 100
    elif name == 'bad_route':
        target = lab.create('routes', device_id=a['id'], interface_id=pa['id'], network='0.0.0.0/0', next_hop='10.0.0.2')
        value = '192.0.2.0/24'
    elif name == 'firewall_block':
        target, value = a, [{'action': 'deny'}]
    elif name == 'failed_device':
        target, value = a, 'failed'
    else:
        target = lab.create('vms', name='Guest', model_id=a['model_id'], hypervisor_id=a['id'])
        value = 'failed'
    with lab.store.transaction() as tx:
        before = config(snapshot(tx, lab.cid))
    fault = lab.run('fault.setup', {'name': name, 'target_id': target['id'], 'value': value})['result']
    assert not lab.run('fault.check', {'id': fault['id'], 'version': 1})['result']['solved']
    lab.run('fault.cleanup', {'id': fault['id'], 'version': 1})
    with lab.store.transaction() as tx:
        assert config(snapshot(tx, lab.cid)) == before
    with pytest.raises(DomainError):
        lab.run('fault.cleanup', {'id': fault['id'], 'version': 2})


def test_layout_baseline_restoration(lab):
    a, _, _, _, _ = lab.network()
    layout = lab.create('layouts', name='Original', positions=[{'device_id': a['id'], 'x': 5, 'y': 10}])
    lab.run('layout.restore', {'id': layout['id'], 'version': 1})
    lab.run('baseline.save', {})
    lab.run('update', {'kind': 'layouts', 'id': layout['id'], 'version': 1,
                       'data': {'positions': [{'device_id': a['id'], 'x': 20, 'y': 30}]}})
    lab.run('layout.restore', {'id': layout['id'], 'version': 2})
    lab.run('baseline.restore', {})
    with lab.store.transaction() as tx:
        active = tx.list('lab.active-layout', lab.cid)[0]
        assert active['positions'] == layout['positions']
