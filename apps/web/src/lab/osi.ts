// Packet Tracer's "OSI Model" tab for one event: what each layer did on the way in and on the way out.
import { serviceName, type Hop } from './simulate';

export type OsiRow = { layer: number; text: string };
export interface OsiView {
  in: OsiRow[];
  out: OsiRow[];
  /** Plain-language summary of the decision at this device */
  summary: string;
}

const BCAST = 'ff:ff:ff:ff:ff:ff';

export function osiView(h: Hop): OsiView {
  const p = h.pdu;
  const tag = p.vlan !== undefined ? ` in VLAN ${p.vlan}` : '';
  const l4 = p.proto === 'tcp' || p.proto === 'udp' ? `${p.proto.toUpperCase()} source port ${p.sport}, destination port ${serviceName(p.dport)}` : '';
  const IN: OsiRow[] = [];
  const OUT: OsiRow[] = [];
  if (h.inIface) IN.push({ layer: 1, text: `The frame arrives on ${h.inIface}.` });
  switch (h.decision) {
    case 'send':
      if (l4) OUT.push({ layer: 4, text: `Builds a ${l4} segment.` });
      if (p.proto === 'icmp') OUT.push({ layer: 3, text: `Builds an ICMP echo request.` });
      OUT.push({ layer: 3, text: `Puts it in an IPv4 packet: ${p.srcIp} → ${p.dstIp}, TTL ${p.ttl}.` });
      OUT.push({ layer: 2, text: `Wraps it in an Ethernet frame: ${p.srcMac || '?'} → ${p.dstMac || '?'}.` });
      if (h.outIface) OUT.push({ layer: 1, text: `Sends the bits out ${h.outIface}.` });
      break;
    case 'arp':
      OUT.push({ layer: 3, text: `Needs the MAC address for ${p.dstIp} before it can send.` });
      OUT.push({ layer: 2, text: `Sends an ARP request to ${BCAST} (everyone${tag}): "Who has ${p.dstIp}?"` });
      if (h.outIface) OUT.push({ layer: 1, text: `Floods it out ${h.outIface}.` });
      break;
    case 'switch':
      IN.push({ layer: 2, text: `Learns ${p.srcMac || 'the source MAC'} on ${h.inIface ?? 'this port'}${tag}. Looks up ${p.dstMac || 'the destination MAC'} in the MAC address table.` });
      OUT.push({ layer: 2, text: p.dstMac === BCAST ? `Broadcast: floods it to every port${tag} except the one it came in on.` : `Forwards it${tag}${h.outIface ? ` out ${h.outIface}` : ''}${p.vlan !== undefined && h.outIface ? ' (tagged 802.1Q if that port is a trunk)' : ''}.` });
      if (h.outIface) OUT.push({ layer: 1, text: `Sends the bits out ${h.outIface}.` });
      break;
    case 'route':
      IN.push({ layer: 2, text: `The destination MAC is this router's, so it strips the Ethernet header.` });
      IN.push({ layer: 3, text: `Looks up ${p.dstIp} in the routing table${h.route ? `: ${h.route}` : ''}.` });
      OUT.push({ layer: 3, text: `Lowers the TTL to ${p.ttl}.` });
      OUT.push({ layer: 2, text: `Builds a new Ethernet frame: ${p.srcMac || '?'} → ${p.dstMac || '?'}${tag}.` });
      if (h.outIface) OUT.push({ layer: 1, text: `Sends the bits out ${h.outIface}.` });
      break;
    case 'nat':
      IN.push({ layer: 3, text: `Matches the NAT rule for this traffic.` });
      OUT.push({ layer: 3, text: h.info });
      if (h.outIface) OUT.push({ layer: 1, text: `Sends the bits out ${h.outIface}.` });
      break;
    case 'deliver':
      IN.push({ layer: 2, text: `The destination MAC ${p.dstMac || ''} is this device's, so it accepts the frame.` });
      IN.push({ layer: 3, text: `The destination IP ${p.dstIp} is this device's.` });
      if (l4) IN.push({ layer: 4, text: `${l4}: a service is listening.` });
      if (p.proto === 'icmp') IN.push({ layer: 3, text: `ICMP echo request: it will send an echo reply.` });
      IN.push({ layer: 7, text: `The application gets the data.` });
      break;
    case 'block':
      IN.push({ layer: h.acl ? (l4 ? 4 : 3) : 3, text: h.acl ? `${h.acl.implicit ? 'No rule matched, so the implicit deny drops it' : `Rule ${h.acl.rule} (${h.acl.descr}) blocks it`} on ${h.acl.iface}.` : h.info });
      break;
    default:
      IN.push({ layer: Number(h.layer.slice(1)), text: h.info });
  }
  return { in: IN, out: OUT, summary: h.info };
}

export const LAYER_NAME = ['', 'Physical', 'Data link', 'Network', 'Transport', 'Session', 'Presentation', 'Application'];
