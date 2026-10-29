"""Atomic topology commands; no infrastructure calls occur inside these transactions."""
import hashlib
import json
import time
from copy import deepcopy
from ipaddress import ip_address, ip_interface, ip_network
from uuid import UUID, uuid5, NAMESPACE_URL
from pydantic import ValidationError
from services.common.errors import DomainError
from services.common.store import now, uid
from services.evidence.service import append, canonical
from .models import SCHEMAS


def fail(code, message, **details):
    raise DomainError(code, message, 409, details)


def get(tx, kind, identifier, cid):
    return tx.get('lab.' + kind, str(identifier), cid)


def listing(tx, kind, cid):
    return tx.list('lab.' + kind, cid)


def device(tx, identifier, cid):
    try:
        return get(tx, 'devices', identifier, cid)
    except DomainError as exc:
        if exc.status != 404:
            raise
        return get(tx, 'vms', identifier, cid)


def revision(tx, cid):
    rows = listing(tx, 'revision', cid)
    return rows[0]['version'] if rows else 0


def snapshot(tx, cid):
    return {kind: listing(tx, kind, cid) for kind in SCHEMAS}


def validate_cable(tx, cable, cid):
    a, b = (get(tx, 'interfaces', cable[key], cid) for key in ('a', 'b'))
    ct = get(tx, 'cable-types', cable['type_id'], cid)
    da, db = (device(tx, p['device_id'], cid) for p in (a, b))
    roles = [get(tx, 'device-models', d['model_id'], cid)['role'] for d in (da, db)]
    issues = []

    def check(condition, code, message):
        if condition:
            issues.append({'code': code, 'message': message, 'ports': [a['id'], b['id']]})

    check(a['id'] == b['id'] or da['id'] == db['id'], 'unsupported_link', 'A cable must join ports on two different devices')
    occupied = {c[k] for c in listing(tx, 'cables', cid) if c['id'] != cable.get('id') for k in ('a', 'b')}
    check(a['id'] in occupied or b['id'] in occupied, 'port_occupied', 'Disconnect the existing cable before using this port')
    check(not a['enabled'] or not b['enabled'], 'interface_shutdown', 'Both interfaces must be enabled')
    types = {a['port_type'], b['port_type']}
    console = types == {'console', 'serial'} and 'console_server' in roles
    check(a['port_type'] != b['port_type'] and not console, 'port_type', 'Port types are incompatible')
    expected_medium = 'console' if console or types == {'console'} else {'ethernet': 'copper'}.get(a['port_type'], a['port_type'])
    check(ct['medium'] != expected_medium, 'medium_mismatch', 'Cable medium does not match the ports')
    if 'ethernet' in types:
        same_wiring = (roles[0] == 'switch') == (roles[1] == 'switch')
        required = 'crossover' if same_wiring else 'straight'
        check(ct['wiring'] != required, 'ethernet_wiring', f'This link requires {required} wiring')
    if 'fiber' in types:
        check(ct['wiring'] != 'fiber', 'fiber_wiring', 'Fiber ports require a fiber cable')
    if types & {'serial', 'console'}:
        check('console' in types and not console, 'console_target', 'Console ports require a serial port on a console server')
        check(ct['wiring'] != ('rollover' if console else 'serial'), 'serial_wiring', 'Invalid serial/console wiring')
    if types & {'ethernet', 'fiber'}:
        check(a['speed'] != b['speed'], 'speed_mismatch', 'Configured port speeds differ')
        check(a['duplex'] != b['duplex'], 'duplex_mismatch', 'Configured duplex modes differ')
        check({a['mode'], b['mode']} == {'trunk', 'access'}, 'mode_mismatch', 'Trunk cannot connect to an access port')
        check(not set(a['vlans']) & set(b['vlans']) or a['native_vlan'] != b['native_vlan'],
              'vlan_mismatch', 'Ports need a shared VLAN and matching native VLAN')
    if issues:
        fail('connection_rejected', 'Cable connection failed validation', violations=issues)


def validate(tx, kind, value, cid):
    refs = {'racks': {'site_id': 'sites'}, 'devices': {'model_id': 'device-models', 'rack_id': 'racks'},
            'vms': {'model_id': 'device-models', 'rack_id': 'racks'}, 'subnets': {'vlan_id': 'vlans'},
            'routes': {'interface_id': 'interfaces'}}
    for field, target in refs.get(kind, {}).items():
        if value.get(field):
            get(tx, target, value[field], cid)
    if kind in ('interfaces', 'routes'):
        device(tx, value['device_id'], cid)
    if kind == 'vms':
        device(tx, value['hypervisor_id'], cid)
    if kind == 'routes':
        interface = get(tx, 'interfaces', value['interface_id'], cid)
        if interface['device_id'] != value['device_id']:
            fail('route_interface', 'Route interface must belong to the device')
        if value.get('next_hop'):
            if not interface['address'] or ip_address(value['next_hop']) not in ip_interface(interface['address']).network:
                fail('route_gateway', 'Next hop must be on the selected interface subnet')
    if kind == 'interfaces':
        if value['mode'] == 'access' and (len(value['vlans']) != 1 or value['native_vlan'] not in value['vlans']):
            fail('access_vlan', 'Access ports require exactly their native VLAN')
        if value['native_vlan'] not in value['vlans']:
            fail('native_vlan', 'Native VLAN must be allowed')
        if any(p['device_id'] == value['device_id'] and p['name'] == value['name'] and p['id'] != value.get('id')
               for p in listing(tx, kind, cid)):
            fail('duplicate_port', 'Port names must be unique per device')
    if kind == 'vlans' and any(v['tag'] == value['tag'] and v['id'] != value.get('id') for v in listing(tx, kind, cid)):
        fail('duplicate_vlan', 'VLAN tag already exists')
    if kind == 'subnets':
        net = ip_network(value['cidr'])
        for field in ('dhcp_start', 'dhcp_end', 'gateway'):
            if value.get(field) and ip_address(value[field]) not in net:
                fail('subnet_address', f'{field} must belong to subnet')
        if bool(value['dhcp_start']) != bool(value['dhcp_end']):
            fail('dhcp_range', 'Both DHCP range endpoints are required')
        if value['dhcp_start'] and int(ip_address(value['dhcp_start'])) > int(ip_address(value['dhcp_end'])):
            fail('dhcp_range', 'DHCP range must be ascending')
    if kind in ('devices', 'vms'):
        for address in [value['nat_ip'], *value['dns'].values()]:
            if address:
                ip_address(address)
    if kind == 'layouts':
        for p in value['positions']:
            device(tx, p['device_id'], cid)
    if kind == 'cables':
        validate_cable(tx, value, cid)


class Topology:
    def __init__(self, store, sessions=None):
        self.store, self.sessions = store, sessions

    def rate_limit(self, actor, cid):
        # Separate transaction: rejected writes cannot bypass throttling by rollback.
        minute = int(time.time()) // 60
        identifier = str(uuid5(NAMESPACE_URL, f'lab-rate:{cid}:{actor}:{minute}'))
        with self.store.transaction() as tx:
            row = tx.execute('SELECT data FROM records WHERE kind=? AND id=?', ('lab.rate', identifier)).fetchone()
            count = json.loads(row['data'])['count'] if row else 0
            if count >= 120:
                raise DomainError('rate_limited', 'Lab mutation rate exceeded', 429)
            tx.put('lab.rate', {'id': identifier, 'client_id': cid, 'count': count + 1, 'minute': minute})
            for record in listing(tx, 'rate', cid):
                if record.get('minute', minute) < minute - 2:
                    tx.execute('DELETE FROM records WHERE kind=? AND id=?', ('lab.rate', record['id']))

    def execute(self, actor, cid, idem, expected_revision, operation, payload):
        actor.require(cid, write=True)
        UUID(cid)
        if operation.startswith(('baseline.', 'fault.', 'scenario.')):
            actor.require(cid, admin=True)
        if not idem or len(idem) > 128:
            raise DomainError('idempotency_required', 'Idempotency-Key must contain 1..128 characters', 422)
        self.rate_limit(actor.id, cid)
        digest = hashlib.sha256(canonical({'operation': operation, 'payload': payload, 'revision': expected_revision}).encode()).hexdigest()
        with self.store.transaction() as tx:
            old = tx.execute('SELECT data,digest FROM jobs WHERE actor=? AND client_id=? AND idem=?', (actor.id, cid, idem)).fetchone()
            if old:
                if old['digest'] != digest:
                    fail('idempotency_conflict', 'Key already used for another request')
                return json.loads(old['data'])
            current = revision(tx, cid)
            if current != expected_revision:
                fail('version_conflict', 'Topology changed; reload before retrying', expected=expected_revision, actual=current)
            try:
                result = self.apply(tx, cid, actor.id, operation, payload)
            except (ValidationError, ValueError):
                raise DomainError('invalid_topology', 'Invalid topology fields or network address', 422)
            stamp = now()
            tx.put('lab.revision', {'id': cid, 'client_id': cid, 'version': current + 1, 'updated_at': stamp})
            job = {'id': uid(), 'client_id': cid, 'kind': 'lab.' + operation, 'state': 'completed',
                   'created_at': stamp, 'updated_at': stamp, 'result': result, 'revision': current + 1}
            tx.execute('INSERT INTO jobs(id,client_id,actor,idem,digest,data) VALUES(?,?,?,?,?,?)',
                       (job['id'], cid, actor.id, idem, digest, canonical(job)))
            append(tx, cid, None, 'lab.' + operation, {'job_id': job['id'], 'revision': current + 1, 'result': result}, actor.id)
            tx.event('job.completed', job, 'job', {'job_id': job['id'], 'kind': job['kind'], 'result': result})
            return job

    def apply(self, tx, cid, actor, operation, payload):
        if operation.startswith('scenario.'):
            from . import scenarios
            if operation == 'scenario.setup':
                return scenarios.launch(tx, cid, payload['name'], payload['target_id'], payload['value'])
            return scenarios.phase(tx, cid, payload['id'], operation.split('.')[1], payload['version'])
        if operation == 'power':
            target = device(tx, payload['id'], cid)
            action = payload['action']
            if action not in ('on', 'off', 'reboot'):
                raise DomainError('invalid_power_action', 'Expected on, off, or reboot', 422)
            kind = 'vms' if 'hypervisor_id' in target else 'devices'
            changes = {'power': 'off' if action == 'off' else 'on'}
            if action == 'reboot':
                changes['boot_count'] = target['boot_count'] + 1
            return self.apply(tx, cid, actor, 'update', {'kind': kind, 'id': target['id'],
                              'version': payload['version'], 'data': changes})
        if operation == 'layout.restore':
            layout = get(tx, 'layouts', payload['id'], cid)
            if layout['version'] != payload['version']:
                fail('version_conflict', 'Layout changed')
            for position in layout['positions']:
                device(tx, position['device_id'], cid)
            tx.put('lab.active-layout', {**layout, 'id': cid})
            return layout
        if operation == 'packet':
            from .simulation import trace
            return trace(tx, cid, payload)
        if operation == 'session.open':
            return self.sessions.open(tx, cid, actor, payload['device_id'], payload['protocol'])
        if operation.startswith('session.'):
            return self.sessions.change(tx, cid, actor, payload['id'], payload['version'],
                                        operation.split('.')[1], payload.get('token'), payload.get('command'))
        if operation == 'fault.setup':
            from .faults import setup
            return setup(tx, cid, payload['name'], payload['target_id'], payload['value'])
        if operation.startswith('fault.'):
            from .faults import lifecycle
            return lifecycle(tx, cid, payload['id'], operation.split('.')[1], payload['version'])
        if operation in ('baseline.save', 'baseline.restore'):
            if operation == 'baseline.save':
                value = {'id': cid, 'client_id': cid, 'topology': snapshot(tx, cid), 'active_layout': listing(tx, 'active-layout', cid), 'created_at': now()}
                tx.put('lab.baseline', value)
                return {'saved': True}
            if any(s['state'] != 'terminated' for s in listing(tx, 'sessions', cid)):
                fail('target_busy', 'Terminate console sessions before restoring a baseline')
            if any(f['state'] != 'cleaned' for f in listing(tx, 'faults', cid)):
                fail('target_busy', 'Cleanup faults before restoring a baseline')
            saved = get(tx, 'baseline', cid, cid)
            baseline = saved['topology']
            tx.execute('DELETE FROM records WHERE kind=? AND client_id=?', ('lab.active-layout', cid))
            for layout in saved.get('active_layout', []):
                tx.put('lab.active-layout', layout)
            # Preserve exact configuration, but advance versions to prevent stale-write ABA.
            current = snapshot(tx, cid)
            for kind in SCHEMAS:
                tx.execute('DELETE FROM records WHERE kind=? AND client_id=?', ('lab.' + kind, cid))
                versions = {v['id']: v['version'] for v in current[kind]}
                for item in deepcopy(baseline[kind]):
                    item.update(version=max(item['version'], versions.get(item['id'], 0)) + 1, updated_at=now())
                    tx.put('lab.' + kind, item)
            return {'restored': True}
        kind = payload['kind']
        if kind not in SCHEMAS:
            raise DomainError('unknown_kind', 'Unknown topology object', 404)
        identifier = payload.get('id') or uid()
        old = get(tx, kind, identifier, cid) if operation != 'create' else None
        if old and payload.get('version') != old['version']:
            fail('version_conflict', 'Object changed; reload before retrying', actual=old['version'])
        if operation == 'delete':
            if any(f['state'] != 'cleaned' and identifier in
                   [f['target_id'], *[v for k, v in f['baseline'].items() if k.endswith('_id') or k in ('a', 'b')]]
                   for f in listing(tx, 'faults', cid)):
                fail('target_busy', 'Cleanup active faults before deleting the target')
            if any(s['device_id'] == identifier and s['state'] != 'terminated' for s in listing(tx, 'sessions', cid)):
                fail('target_busy', 'Terminate console sessions before deleting the target')
            for other_kind, items in snapshot(tx, cid).items():
                for item in items:
                    fields = [v for k, v in item.items() if k.endswith('_id') and k != 'client_id']
                    if other_kind == 'cables':
                        fields += [item['a'], item['b']]
                    if other_kind == 'layouts':
                        fields += [p['device_id'] for p in item['positions']]
                    if identifier in fields:
                        fail('object_in_use', 'Remove dependent objects first', kind=other_kind, id=item['id'])
            tx.execute('DELETE FROM records WHERE kind=? AND id=? AND client_id=?', ('lab.' + kind, identifier, cid))
            return {'id': identifier, 'deleted': True}
        fields = {k: v for k, v in (old or {}).items() if k in SCHEMAS[kind].model_fields}
        try:
            value = SCHEMAS[kind].model_validate({**fields, **payload['data']}).model_dump(mode='json')
            value.update(id=identifier)
            validate(tx, kind, value, cid)
        except (ValidationError, ValueError):
            raise DomainError('invalid_topology', 'Invalid topology fields or network address', 422)
        value.update(client_id=cid, version=old['version'] + 1 if old else 1,
                     created_at=old['created_at'] if old else now(), updated_at=now())
        tx.put('lab.' + kind, value)
        return value
