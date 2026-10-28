"""Public read projections; excludes private fake state and baseline material."""

def public_node(node):
    return {k: v for k, v in node.items() if k not in ('baseline', 'lab_state', 'platform_host')}


def client_detail(tx, client):
    counts = {state: 0 for state in ('healthy', 'degraded', 'down', 'unknown')}
    for node in tx.list('node', client['id']):
        state = node.get('health', 'unknown')
        counts[state if state in counts else 'unknown'] += 1
    return {**client, 'health_summary': {'total_nodes': sum(counts.values()), **counts}}


def node_detail(tx, node):
    related_runs = {r['id'] for r in tx.list('run', node['client_id']) if node['id'] in r['targets'].values()}
    tickets = [t for t in tx.list('ticket', node['client_id']) if t['scenario_run_id'] in related_runs and t['status'] != 'closed']
    alerts = [a for a in tx.list('alert', node['client_id']) if a['node_id'] == node['id']]
    return {**public_node(node), 'specs': node.get('specs', {}),
            'ips': node.get('ips', [node['mgmt_ip']]), 'open_tickets': tickets,
            'recent_alerts': sorted(alerts, key=lambda a: (a['created_at'], a['id']), reverse=True)[:20]}
