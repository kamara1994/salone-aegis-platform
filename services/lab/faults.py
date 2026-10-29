"""Trusted reversible fault operations; no scenario strings are executed as code."""
from copy import deepcopy
from services.common.errors import DomainError
from services.common.store import uid, now
from .domain import get

FAULTS = {
    'wrong_cable_type': ('cables', 'type_id'), 'wrong_port': ('cables', 'b'),
    'unplugged_cable': ('cables', 'fault'), 'shut_interface': ('interfaces', 'enabled'),
    'wrong_vlan': ('interfaces', 'vlans'), 'speed_mismatch': ('interfaces', 'speed'),
    'bad_route': ('routes', 'network'), 'firewall_block': ('devices', 'rules'),
    'failed_device': ('devices', 'health'), 'failed_vm': ('vms', 'health'),
}


def setup(tx, cid, name, target, value):
    if name not in FAULTS:
        raise DomainError('unknown_fault', 'Unsupported fault', 422)
    kind, field = FAULTS[name]
    original = get(tx, kind, target, cid)
    if any(f['target_id'] == target and f['state'] != 'cleaned' for f in tx.list('lab.faults', cid)):
        raise DomainError('fault_conflict', 'Target already has an active fault', 409)
    # Faults bypass connection validation intentionally, but never schema or tenant checks.
    from .models import SCHEMAS
    candidate = {k: v for k, v in original.items() if k in SCHEMAS[kind].model_fields}
    candidate[field] = value
    normalized = SCHEMAS[kind].model_validate(candidate).model_dump(mode='json')
    value = normalized[field]
    if field == 'type_id':
        get(tx, 'cable-types', value, cid)
    if field == 'b':
        get(tx, 'interfaces', value, cid)
    record = {'id': uid(), 'client_id': cid, 'kind': kind, 'target_id': target, 'name': name,
              'field': field, 'value': value, 'baseline': deepcopy(original), 'state': 'active',
              'version': 1, 'created_at': now(), 'updated_at': now()}
    changed = {**original, field: value, 'version': original['version'] + 1, 'updated_at': now()}
    tx.put('lab.' + kind, changed)
    tx.put('lab.faults', record)
    return record


def lifecycle(tx, cid, identifier, phase, version):
    fault = get(tx, 'faults', identifier, cid)
    if fault['version'] != version:
        raise DomainError('version_conflict', 'Fault changed', 409)
    if fault['state'] == 'cleaned':
        raise DomainError('invalid_state', 'Fault was already cleaned up', 409)
    current = get(tx, fault['kind'], fault['target_id'], cid)
    if phase == 'check':
        return {'fault_id': identifier, 'solved': current[fault['field']] == fault['baseline'][fault['field']]}
    if phase not in ('solve', 'cleanup'):
        raise DomainError('invalid_phase', 'Expected check, solve, or cleanup', 422)
    restored = {**deepcopy(fault['baseline']), 'version': current['version'] + 1, 'updated_at': now()}
    tx.put('lab.' + fault['kind'], restored)
    fault.update(state='cleaned' if phase == 'cleanup' else 'solved', version=fault['version'] + 1, updated_at=now())
    tx.put('lab.faults', fault)
    return {'fault_id': identifier, 'state': fault['state'], 'version': fault['version']}
