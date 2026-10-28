"""Import trusted inventory; no credentials allowed in this file. Run as deployment admin."""
import argparse
import ipaddress
import json
from uuid import UUID
from services.common.store import Store
from services.common.config import Settings
from services.evidence.service import append
from services.adapters.registry import SYSTEMS

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file')
    parser.add_argument('--actor', required=True)
    args = parser.parse_args()
    data = json.load(open(args.file))
    allowed = {'id', 'client_id', 'site_id', 'name', 'kind', 'system', 'mgmt_ip', 'platform_ref',
               'health', 'tags', 'platform_host', 'baseline', 'lab_state', 'specs', 'ips'}
    with Store(Settings().database_url).transaction() as tx:
        for node in data['nodes']:
            if set(node) - allowed:
                raise ValueError('Unexpected inventory fields; never include credentials')
            for key in ('id', 'client_id', 'site_id'):
                UUID(node[key])
            ipaddress.ip_address(node['mgmt_ip'])
            for address in node.get('ips', []):
                ipaddress.ip_address(address)
            tx.get('client', node['client_id'], node['client_id'])
            tx.get('site', node['site_id'], node['client_id'])
            if node['system'] not in SYSTEMS:
                raise ValueError('Unknown adapter system')
            tx.put('node', node)
            append(tx, node['client_id'], None, 'inventory.updated', {'node_id': node['id']}, args.actor)
    print('Inventory imported')
