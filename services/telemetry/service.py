"""Telemetry accepts data only after tenant-owned node/edge resolution."""
import ipaddress
from datetime import datetime, timezone
from services.common.errors import DomainError
from services.common.store import uid, now
from services.evidence.service import append


def health(tx, client_id, node_id, state):
    if state not in ('healthy', 'degraded', 'down', 'unknown'):
        raise DomainError('invalid_health', 'Unsupported health state')
    node = tx.get('node', node_id, client_id)
    if node['health'] != state:
        old = node['health']
        node['health'] = state
        tx.put('node', node)
        tx.event('node.health_changed', node, 'node', {'from': old, 'to': state})


def flows(tx, client_id, samples):
    normalized = []
    for sample in samples:
        edge = tx.get('link', sample['edge_id'], client_id)
        for field in ('src', 'dst'):
            ipaddress.ip_address(sample[field])
        if sample['verdict'] not in ('allowed', 'denied'):
            raise DomainError('invalid_flow', 'Flow verdict must be allowed or denied')
        if sample['verdict'] == 'denied' and sample.get('source') != 'firewall':
            raise DomainError('invalid_flow', 'Denied verdicts require firewall log evidence')
        if not 0 <= sample['port'] <= 65535 or sample['bytes_per_s'] < 0:
            raise DomainError('invalid_flow', 'Invalid flow port or rate')
        if sample['proto'] not in ('tcp', 'udp', 'icmp', 'icmpv6'):
            raise DomainError('invalid_flow', 'Invalid protocol')
        observed = datetime.fromisoformat(sample.get('observed_at', now()).replace('Z', '+00:00'))
        if observed.tzinfo is None:
            raise DomainError('invalid_flow', 'Flow timestamps must carry a timezone')
        record = {'id': uid(), 'client_id': client_id, 'edge_id': edge['id'],
                  **{k: sample[k] for k in ('src', 'dst', 'port', 'proto', 'bytes_per_s', 'verdict')},
                  'observed_at': observed.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')}
        tx.put('flow', record)
        normalized.append(record)
    if normalized:
        tx.event('flow.batch', {'id': uid(), 'client_id': client_id}, 'flow_batch', {'flows': normalized})
    return normalized


def alert(tx, client_id, node_id, title, severity, external_id):
    tx.get('node', node_id, client_id)
    from uuid import uuid5, NAMESPACE_DNS
    identifier = str(uuid5(NAMESPACE_DNS, client_id + ':' + external_id))
    if any(a['id'] == identifier for a in tx.list('alert', client_id)):
        return
    item = {'id': identifier, 'client_id': client_id, 'node_id': node_id,
            'title': title[:1000], 'severity': severity, 'created_at': now()}
    tx.put('alert', item)
    tx.event('alert.fired', item, 'alert', item)
    append(tx, client_id, None, 'alert.fired', item)
