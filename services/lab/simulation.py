"""Deterministic packet-level model (not an operating-system or IOS emulator)."""
import hashlib
from collections import deque
from ipaddress import ip_address, ip_interface, ip_network
from .domain import snapshot, device, validate_cable
from services.common.errors import DomainError
from .models import Packet
from services.evidence.service import canonical


def arp_neighbor(tx, cid, topology, addresses, start, address, vlan):
    """Resolve only within a physically reachable broadcast domain; never across routers."""
    ports = {p['id']: p for p in topology['interfaces']}
    devices = {d['id']: d for d in topology['devices'] + topology['vms']}
    models = {m['id']: m for m in topology['device-models']}
    queue, visited = deque([start]), set()
    reason = 'arp_unresolved'
    while queue:
        identifier = queue.popleft()
        if identifier in visited:
            continue
        visited.add(identifier)
        port = ports[identifier]
        if not port['enabled'] or vlan not in port['vlans']:
            reason = 'interface_shutdown' if not port['enabled'] else 'vlan_blocked'
            continue
        for cable in topology['cables']:
            if identifier not in (cable['a'], cable['b']) or cable['fault'] != 'none':
                continue
            try:
                validate_cable(tx, cable, cid)
            except DomainError:
                continue
            peer = ports[cable['b'] if identifier == cable['a'] else cable['a']]
            node = devices[peer['device_id']]
            if node['power'] != 'on' or node['health'] == 'failed' or vlan not in peer['vlans']:
                reason = 'vlan_blocked' if vlan not in peer['vlans'] else 'device_unavailable'
                continue
            if peer['id'] in addresses and str(addresses[peer['id']].ip) == address:
                return node['id'], 'resolved'
            if models[node['model_id']]['role'] == 'switch':
                queue.extend(p['id'] for p in ports.values() if p['device_id'] == node['id'] and p['id'] != peer['id'])
    return None, reason


def trace(tx, cid, request):
    packet = Packet.model_validate(request).model_dump(mode='json')
    topology = snapshot(tx, cid)
    devices = {d['id']: d for d in topology['devices'] + topology['vms']}
    models = {m['id']: m for m in topology['device-models']}
    ports = {p['id']: p for p in topology['interfaces']}
    source = device(tx, packet['source_id'], cid)
    destination = source['dns'].get(packet['destination'], packet['destination'])
    hops = []
    result = {'packet': packet, 'hops': hops, 'success': False, 'reason': 'no_path', 'latency_ms': 0, 'packet_loss': 0}
    try:
        target = ip_address(destination)
    except ValueError:
        return {**result, 'reason': 'dns_unresolved'}
    if destination != packet['destination']:
        hops.append({'device_id': source['id'], 'decision': 'dns', 'answer': destination})
    addresses = {}
    allocated = set()
    for p in sorted(ports.values(), key=lambda p: p['id']):
        if p['address']:
            addresses[p['id']] = ip_interface(p['address'])
            allocated.add(addresses[p['id']].ip)
    for p in sorted(ports.values(), key=lambda p: p['id']):
        if not p['dhcp'] or p['id'] in addresses:
            continue
        for subnet in topology['subnets']:
            vlan = next(v for v in topology['vlans'] if v['id'] == subnet['vlan_id'])
            if vlan['tag'] not in p['vlans'] or not subnet['dhcp_start']:
                continue
            start, end = int(ip_address(subnet['dhcp_start'])), int(ip_address(subnet['dhcp_end']))
            # Bound work even for enormous IPv6 pools; at most one address per port is needed.
            for offset in range(min(end - start + 1, len(ports) + 2)):
                address = ip_address(start + offset)
                if address not in allocated and str(address) != subnet['gateway']:
                    addresses[p['id']] = ip_interface(f"{address}/{ip_network(subnet['cidr']).prefixlen}")
                    allocated.add(address)
                    break
            break
    source_ports = [p for p in ports.values() if p['device_id'] == source['id']]
    source_ip = next((str(addresses[p['id']].ip) for p in source_ports if p['id'] in addresses), None)
    if not source_ip:
        return {**result, 'reason': 'source_unconfigured'}
    queue = deque([(source['id'], None, None, source_ip, 0, 0, None)])
    visited = set()
    failure = 'no_path'
    while queue:
        did, ingress, vlan, sender, latency, depth, neighbor = queue.popleft()
        state = (did, ingress, vlan, sender, neighbor)
        if state in visited:
            continue
        visited.add(state)
        d = devices[did]
        hop = {'source': sender, 'destination': str(target), 'device_id': did, 'protocol': packet['protocol'],
               'port': packet['port'], 'interface': ingress, 'vlan': vlan, 'route': None,
               'acl_result': 'allow', 'latency_ms': latency, 'packet_loss': 0, 'decision': 'forward'}
        hops.append(hop)
        if depth >= packet['ttl']:
            hop['decision'] = failure = 'ttl_exceeded'
            continue
        if d['power'] != 'on' or d['health'] == 'failed':
            hop['decision'] = failure = 'device_unavailable'
            continue
        denied = False
        for index, rule in enumerate(d['rules']):
            if (rule['protocol'] in ('any', packet['protocol']) and rule['port'] in (None, packet['port'])
                    and ip_address(sender) in ip_network(rule['source']) and target in ip_network(rule['destination'])):
                hop['acl_result'] = rule['action']
                hop['acl_rule'] = index
                denied = rule['action'] == 'deny'
                break
        if denied:
            hop['decision'] = failure = 'acl_denied'
            continue
        local_ports = [p for p in ports.values() if p['device_id'] == did]
        if any(p['enabled'] and p['id'] in addresses and addresses[p['id']].ip == target for p in local_ports):
            hop['decision'] = 'delivered'
            return {**result, 'success': True, 'reason': 'delivered', 'latency_ms': latency}
        role = models[d['model_id']]['role']
        if ingress and neighbor and did != neighbor and role != 'switch':
            hop['decision'] = failure = 'not_next_hop'
            continue
        if ingress and role in ('host', 'console_server'):
            hop['decision'] = failure = 'not_a_router'
            continue
        outgoing = [p for p in local_ports if p['id'] != ingress]
        if role != 'switch':
            direct = [p for p in outgoing if p['id'] in addresses and target in addresses[p['id']].network]
            routes = sorted([r for r in topology['routes'] if r['device_id'] == did and target in ip_network(r['network'])],
                            key=lambda r: (-ip_network(r['network']).prefixlen, r['metric'], r['id']))
            if direct:
                outgoing = direct
                hop['route'] = 'connected'
            elif routes:
                route = routes[0]
                outgoing = [p for p in outgoing if p['id'] == route['interface_id']]
                hop['route'] = route['id']
                hop['next_hop'] = route['next_hop']
                # An unresolved next-hop cannot magically route through the link.
                if route['next_hop'] and not any(str(a.ip) == route['next_hop'] for a in addresses.values()):
                    hop['decision'] = failure = 'arp_unresolved'
                    continue
            else:
                hop['decision'] = failure = 'no_route'
                continue
        if d['nat_ip'] and role in ('router', 'firewall'):
            hop['nat'] = {'from': sender, 'to': d['nat_ip']}
            sender = d['nat_ip']
        advanced = False
        for p in sorted(outgoing, key=lambda p: p['id']):
            if not p['enabled']:
                failure = 'interface_shutdown'
                continue
            if p['port_type'] not in ('ethernet', 'fiber'):
                continue
            tag = vlan if role == 'switch' and vlan else p['native_vlan']
            if tag not in p['vlans']:
                failure = 'vlan_blocked'
                continue
            cable = next((c for c in topology['cables'] if p['id'] in (c['a'], c['b'])), None)
            if not cable:
                failure = 'unplugged'
                continue
            other = ports[cable['b'] if cable['a'] == p['id'] else cable['a']]
            decision = {'source': sender, 'destination': str(target), 'protocol': packet['protocol'], 'port': packet['port'],
                        'device_id': did, 'interface': p['id'], 'peer_interface': other['id'], 'vlan': tag,
                        'tagged': p['mode'] == 'trunk' and tag != p['native_vlan'], 'route': hop['route'],
                        'acl_result': hop['acl_result'], 'latency_ms': cable['latency_ms'], 'packet_loss': cable['loss_percent'],
                        'decision': 'ethernet_forward', 'arp': hop.get('next_hop') or str(target)}
            hops.append(decision)
            why = None
            if cable['fault'] != 'none':
                why = 'cable_' + cable['fault']
            elif not other['enabled']:
                why = 'interface_shutdown'
            elif tag not in other['vlans'] or (p['mode'] == 'trunk') != (other['mode'] == 'trunk'):
                why = 'vlan_mismatch'
            elif p['speed'] != other['speed'] or p['duplex'] != other['duplex']:
                why = 'speed_duplex_mismatch'
            else:
                sample = int(hashlib.sha256(canonical([packet, cable['id']]).encode()).hexdigest()[:8], 16) / 2**32 * 100
                if sample < cable['loss_percent']:
                    why = 'packet_lost'
            if not why:
                try:
                    validate_cable(tx, cable, cid)
                except DomainError as exc:
                    why = exc.details.get('violations', [{'code': exc.code}])[0]['code']
            if why:
                decision['decision'] = failure = why
                if why == 'packet_lost':
                    result['packet_loss'] = 100
                continue
            next_neighbor = neighbor
            if role != 'switch':
                arp_target = hop.get('next_hop') or str(target)
                next_neighbor, arp_reason = arp_neighbor(tx, cid, topology, addresses, p['id'], arp_target, tag)
                decision['arp_result'] = 'resolved' if next_neighbor else 'unresolved'
                if not next_neighbor:
                    decision['decision'] = failure = arp_reason
                    continue
            advanced = True
            queue.append((other['device_id'], other['id'], tag, sender, latency + cable['latency_ms'], depth + 1, next_neighbor))
        if not advanced:
            hop['decision'] = failure
    return {**result, 'reason': failure}
