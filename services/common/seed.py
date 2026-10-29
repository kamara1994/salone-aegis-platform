from uuid import uuid5, NAMESPACE_DNS
from services.orchestrator.scenarios import load


def stable(value):
    return str(uuid5(NAMESPACE_DNS, 'aegis.' + value))

CLIENTS = [stable('salone-mutual'), stable('kamara-logistics')]


def seed(store, scenario_dir='scenarios'):
    packs = load(scenario_dir)
    with store.transaction() as tx:
        for slug, sector, gateway in [('salone-mutual', 'bank', '10.10.20.1'),
                                      ('kamara-logistics', 'logistics', '10.20.20.1')]:
            cid = stable(slug)
            if tx.list('client', cid):
                continue
            tx.put('client', {'id': cid, 'client_id': cid, 'slug': slug, 'name': slug.replace('-', ' ').title(),
                              'sector': sector, 'sla_tier': 'gold', 'status': 'active'})
            site_id = stable(slug + '.hq')
            tx.put('site', {'id': site_id, 'client_id': cid, 'name': 'HQ', 'cidr': gateway.rsplit('.', 1)[0] + '.0/24'})
            for name, system, kind in [('ws-fin-02', 'active_directory', 'vm'), ('fw-01', 'opnsense', 'firewall')]:
                baseline = {'gateway': gateway, 'power': 'running', 'logs': []}
                nid = stable(slug + '.' + name)
                tx.put('node', {'id': nid, 'client_id': cid, 'site_id': site_id, 'name': name,
                                'kind': kind, 'system': system, 'mgmt_ip': gateway.rsplit('.', 1)[0] + ('.20' if kind == 'vm' else '.1'),
                                'platform_ref': name, 'health': 'healthy', 'tags': ['lab'],
                                'platform_host': False, 'baseline': baseline, 'lab_state': baseline.copy()})
            tx.put('link', {'id': stable(slug + '.edge'), 'client_id': cid,
                            'a_node_id': stable(slug + '.ws-fin-02'), 'b_node_id': stable(slug + '.fw-01'),
                            'kind': 'ethernet', 'state': 'up'})
            tx.put('persona', {'id': stable(slug + '.persona'), 'client_id': cid, 'name': 'Aminata',
                               'role': 'finance clerk', 'traits': ['urgent', 'nontechnical'],
                               'verify_identity_answers': {'employee_code': 'LAB-204'}, 'impostor': False})
        for pack in packs:
            tx.put('scenario', {**pack, 'client_id': 'global',
                                'sla': dict(pack['sla'])})
