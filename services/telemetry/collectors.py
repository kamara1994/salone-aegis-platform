import urllib.parse
from services.adapters.live import request, Vault
from .service import health, flows, alert

class Collector:
    def __init__(self, registry):
        self.registry = registry

    def collect(self, tx, client_id):
        for node in tx.list('node', client_id):
            try:
                observed = self.registry.get(node).read(node, 'read.health')
                health(tx, client_id, node['id'], 'healthy' if observed.get('power') == 'running' else ('down' if observed.get('power') == 'stopped' else 'unknown'))
            except Exception:
                health(tx, client_id, node['id'], 'unknown')

    def prometheus(self, tx, client_id):
        config = Vault().credentials('prometheus')
        # Query is fixed by trusted configuration; tenant identity comes from stored node labels.
        query = urllib.parse.urlencode({'query': 'up{client_id="' + client_id + '"}'})
        result = request(config['url'] + '/api/v1/query?' + query,
                         headers={'Authorization': 'Bearer ' + config['token']})
        nodes = {n['id'] for n in tx.list('node', client_id)}
        for item in result.get('data', {}).get('result', []):
            node_id = item['metric'].get('node_id')
            if node_id in nodes:
                health(tx, client_id, node_id, 'healthy' if item['value'][1] == '1' else 'down')

    def opensearch(self, tx, client_id):
        config = Vault().credentials('opensearch')
        cursor_id = client_id  # one persistent cursor per tenant
        existing = [x for x in tx.list('telemetry_cursor', client_id) if x['id'] == cursor_id]
        previous = existing[0].get('sort') if existing else None
        query = {'size': 500, 'query': {'term': {'client_id.keyword': client_id}},
                 'sort': [{'@timestamp': 'asc'}, {'event_id.keyword': 'asc'}]}
        if previous:
            query['search_after'] = previous
        result = request(config['url'] + '/aegis-telemetry-*/_search', 'POST', query,
                         {'Authorization': 'Bearer ' + config['token']})
        hits = result.get('hits', {}).get('hits', [])
        samples = []
        for hit in hits:
            data = hit['_source']
            if data['kind'] == 'flow':
                samples.append(data)
            elif data['kind'] == 'alert':
                alert(tx, client_id, data['node_id'], data['title'], data['severity'], data['event_id'])
        flows(tx, client_id, samples)
        if hits:
            tx.put('telemetry_cursor', {'id': cursor_id, 'client_id': client_id, 'sort': hits[-1]['sort']})
