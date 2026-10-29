"""Server-owned scenario packs for the interactive topology.

Existing script packs remain subject to contracts/scenario.schema.json. These
backend packs use structured fault operations and never execute script strings.
"""
from services.common.errors import DomainError
from services.common.store import uid, now
from . import faults
from .domain import get

PACKS = {name: {'id': name, 'version': 1, 'phases': ['setup', 'check', 'solve', 'cleanup']}
         for name in faults.FAULTS}


def launch(tx, cid, name, target, value):
    if name not in PACKS:
        raise DomainError('unknown_scenario', 'Unknown topology scenario', 404)
    fault = faults.setup(tx, cid, name, target, value)
    run = {'id': uid(), 'client_id': cid, 'scenario': PACKS[name], 'fault_id': fault['id'],
           'state': 'running', 'version': 1, 'created_at': now(), 'updated_at': now()}
    tx.put('lab.scenario-runs', run)
    return run


def phase(tx, cid, identifier, operation, version):
    run = get(tx, 'scenario-runs', identifier, cid)
    if run['version'] != version:
        raise DomainError('version_conflict', 'Scenario run changed', 409)
    if run['state'] == 'cleaned':
        raise DomainError('invalid_state', 'Scenario was already cleaned up', 409)
    fault = get(tx, 'faults', run['fault_id'], cid)
    result = faults.lifecycle(tx, cid, fault['id'], operation, fault['version'])
    if operation == 'cleanup':
        run['state'] = 'cleaned'
    elif operation == 'solve':
        run['state'] = 'solved'
    run.update(version=run['version'] + 1, updated_at=now())
    tx.put('lab.scenario-runs', run)
    return {'run': run, 'result': result}
