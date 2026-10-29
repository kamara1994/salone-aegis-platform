// Packet capture for the lab designer: turns simulated packet traces into frames as they would
// appear on a wire, lists them like Wireshark does, and writes a real libpcap file (Ethernet,
// 802.1Q, ARP, IPv4, ICMP, TCP, UDP, with valid IP and ICMP checksums) that Wireshark opens.
import type { Hop, PacketTrace } from './simulate';
import { ipToInt } from './net';
import type { LabDoc } from './types';

export interface Frame {
  no: number;
  time: number; // seconds since the first frame
  cableId?: string;
  where: string; // "SW-ACC-01 Gi0/12 → FW01 igb1"
  src: string;
  dst: string;
  protocol: string;
  length: number;
  info: string;
  bytes: Uint8Array;
  traceId: string;
  hop: number;
  decision: Hop['decision'];
}

const macBytes = (m: string) => {
  const parts = (m || '00:00:00:00:00:00').split(/[:.-]/).join('').padEnd(12, '0').slice(0, 12);
  return Array.from({ length: 6 }, (_, k) => parseInt(parts.slice(k * 2, k * 2 + 2), 16) || 0);
};
const ipBytes = (ip: string) => {
  const n = ipToInt(ip) ?? 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
};
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];

/** RFC 1071 Internet checksum. */
export function checksum(bytes: number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) + (bytes[i + 1] ?? 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

/** ARP sender/target addresses, from the hop description (the PDU keeps the packet's own IPs). */
function arpAddrs(h: Hop): { reply: boolean; sender: string; target: string } {
  const req = /who has ([\d.]+)\? Tell ([\d.]+)/i.exec(h.info);
  if (req) return { reply: false, sender: req[2], target: req[1] };
  const rep = /([\d.]+) is at/i.exec(h.info);
  return { reply: true, sender: rep?.[1] ?? h.pdu.dstIp, target: h.pdu.srcIp };
}

/** Builds the bytes of one frame from a hop's PDU. */
export function encodeFrame(h: Hop, seq: number): Uint8Array {
  const p = h.pdu;
  const eth = [...macBytes(p.dstMac), ...macBytes(p.srcMac)];
  const tag = p.vlan && p.vlan > 1 ? [0x81, 0x00, ...u16(p.vlan & 0x0fff)] : [];
  if (p.proto === 'arp') {
    const { reply, sender, target } = arpAddrs(h);
    const arp = [0, 1, 8, 0, 6, 4, 0, reply ? 2 : 1, ...macBytes(p.srcMac), ...ipBytes(sender), ...(reply ? macBytes(p.dstMac) : [0, 0, 0, 0, 0, 0]), ...ipBytes(target)];
    const bcast = reply ? eth : [255, 255, 255, 255, 255, 255, ...macBytes(p.srcMac)];
    return new Uint8Array([...bcast, ...tag, 0x08, 0x06, ...arp, ...new Array(18).fill(0)]);
  }
  let l4: number[];
  const payload = new Array(Math.max(0, Math.min(56, p.bytes - 28))).fill(0x61);
  if (p.proto === 'icmp') {
    const reply = /reply/i.test(h.info);
    const body = [reply ? 0 : 8, 0, 0, 0, ...u16(0x1d1d), ...u16(seq), ...payload];
    const c = checksum(body);
    body[2] = c >> 8;
    body[3] = c & 255;
    l4 = body;
  } else if (p.proto === 'tcp') {
    l4 = [...u16(p.sport ?? 49152), ...u16(p.dport ?? 0), 0, 0, 0, 1, 0, 0, 0, 0, 0x50, 0x02, ...u16(64240), 0, 0, 0, 0];
    const pseudo = [...ipBytes(p.srcIp), ...ipBytes(p.dstIp), 0, 6, ...u16(l4.length)];
    const c = checksum([...pseudo, ...l4]);
    l4[16] = c >> 8;
    l4[17] = c & 255;
  } else {
    const body = [0x41, 0x45, 0x47, 0x49, 0x53]; // "AEGIS"
    l4 = [...u16(p.sport ?? 49152), ...u16(p.dport ?? 0), ...u16(8 + body.length), 0, 0, ...body];
    const pseudo = [...ipBytes(p.srcIp), ...ipBytes(p.dstIp), 0, 17, ...u16(l4.length)];
    const c = checksum([...pseudo, ...l4]) || 0xffff;
    l4[6] = c >> 8;
    l4[7] = c & 255;
  }
  const proto = p.proto === 'icmp' ? 1 : p.proto === 'tcp' ? 6 : 17;
  const ip = [0x45, 0, ...u16(20 + l4.length), ...u16(seq & 0xffff), 0x40, 0, Math.max(1, Math.min(255, p.ttl)), proto, 0, 0, ...ipBytes(p.srcIp), ...ipBytes(p.dstIp)];
  const c = checksum(ip);
  ip[10] = c >> 8;
  ip[11] = c & 255;
  return new Uint8Array([...eth, ...tag, 0x08, 0x00, ...ip, ...l4]);
}

function describe(h: Hop, trace: PacketTrace): { protocol: string; info: string } {
  const p = h.pdu;
  if (p.proto === 'arp') {
    const a = arpAddrs(h);
    return { protocol: 'ARP', info: a.reply ? `${a.sender} is at ${p.srcMac}` : `Who has ${a.target}? Tell ${a.sender}` };
  }
  if (p.proto === 'icmp') return { protocol: 'ICMP', info: `Echo (ping) ${/reply/i.test(h.info) ? 'reply' : 'request'}  ttl=${p.ttl}` };
  const svc: Record<number, string> = { 53: 'DNS', 67: 'DHCP', 80: 'HTTP', 443: 'TLS', 445: 'SMB2', 22: 'SSH', 3389: 'RDP', 389: 'LDAP', 5432: 'PGSQL', 88: 'KRB5' };
  const app = svc[p.dport ?? 0];
  if (p.proto === 'tcp') return { protocol: app && h.decision === 'deliver' ? app : 'TCP', info: `${p.sport} → ${p.dport} [SYN] Seq=0 Win=64240 Len=0` };
  return { protocol: app ?? 'UDP', info: `${p.sport} → ${p.dport} Len=5${trace.request.port === 67 ? ' (DHCP relay)' : ''}` };
}

/**
 * Frames seen on the wire. With `cableId`, only frames that crossed that cable (a span port on
 * one link); otherwise every frame that crossed any cable.
 */
export function framesFor(doc: LabDoc, traces: PacketTrace[], cableId?: string): Frame[] {
  const name = (id: string) => doc.devices.find((d) => d.id === id)?.name ?? id;
  const out: Frame[] = [];
  const ordered = [...traces].sort((a, b) => a.at.localeCompare(b.at));
  const t0 = ordered.length ? Date.parse(ordered[0].at) : 0;
  for (const tr of ordered) {
    tr.hops.forEach((h, k) => {
      // ARP is exchanged on the first link of the segment the packet is about to cross.
      const wire = h.cableId ?? (h.decision === 'arp' ? tr.hops.slice(k + 1).find((x) => x.cableId)?.cableId : undefined);
      if (!wire) return;
      if (cableId && wire !== cableId) return;
      const prev = tr.hops[k - 1];
      const d = describe(h, tr);
      const bytes = encodeFrame(h, out.length + 1);
      out.push({
        no: out.length + 1,
        time: (Date.parse(tr.at) - t0) / 1000 + h.t / 1000,
        cableId: wire,
        where: h.decision === 'arp' ? `${h.deviceName} ${h.outIface ?? h.inIface ?? ''} (ARP)` : `${prev ? name(prev.device) : '?'}${prev?.outIface ? ` ${prev.outIface}` : ''} → ${h.deviceName}${h.inIface ? ` ${h.inIface}` : ''}`,
        src: h.pdu.proto === 'arp' ? h.pdu.srcMac : h.pdu.srcIp,
        dst: h.pdu.proto === 'arp' ? (arpAddrs(h).reply ? h.pdu.dstMac : 'Broadcast') : h.pdu.dstIp,
        ...d,
        length: bytes.length,
        bytes,
        traceId: tr.id,
        hop: k,
        decision: h.decision,
      });
    });
  }
  return out;
}

/** libpcap file (magic a1b2c3d4, LINKTYPE_ETHERNET). */
export function toPcap(frames: Frame[], startMs = Date.now()): Uint8Array {
  const parts: number[] = [];
  const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
  parts.push(...le32(0xa1b2c3d4), ...le16(2), ...le16(4), ...le32(0), ...le32(0), ...le32(65535), ...le32(1));
  for (const f of frames) {
    const ms = startMs + f.time * 1000;
    parts.push(...le32(Math.floor(ms / 1000)), ...le32(Math.round((ms % 1000) * 1000)), ...le32(f.bytes.length), ...le32(f.bytes.length), ...f.bytes);
  }
  return new Uint8Array(parts);
}

export function hexDump(b: Uint8Array): string {
  const rows: string[] = [];
  for (let i = 0; i < b.length; i += 16) {
    const chunk = Array.from(b.slice(i, i + 16));
    rows.push(`${i.toString(16).padStart(4, '0')}  ${chunk.map((x) => x.toString(16).padStart(2, '0')).join(' ').padEnd(48)}  ${chunk.map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}`);
  }
  return rows.join('\n');
}

/** Decoded layers for the packet-details pane. */
export function dissect(f: Frame): { layer: string; fields: [string, string][] }[] {
  const b = f.bytes;
  const mac = (o: number) => Array.from(b.slice(o, o + 6)).map((x) => x.toString(16).padStart(2, '0')).join(':');
  const ip = (o: number) => Array.from(b.slice(o, o + 4)).join('.');
  const out: { layer: string; fields: [string, string][] }[] = [{ layer: `Frame ${f.no}: ${f.length} bytes on wire`, fields: [['Link', f.where]] }];
  let o = 12;
  const eth: [string, string][] = [['Destination', mac(0)], ['Source', mac(6)]];
  if (b[12] === 0x81 && b[13] === 0) {
    eth.push(['802.1Q VLAN', String(((b[14] << 8) | b[15]) & 0x0fff)]);
    o = 16;
  }
  const type = (b[o] << 8) | b[o + 1];
  eth.push(['Type', type === 0x0806 ? 'ARP (0x0806)' : 'IPv4 (0x0800)']);
  out.push({ layer: 'Ethernet II', fields: eth });
  o += 2;
  if (type === 0x0806) {
    out.push({ layer: 'Address Resolution Protocol', fields: [['Opcode', b[o + 7] === 2 ? 'reply (2)' : 'request (1)'], ['Sender MAC', mac(o + 8)], ['Sender IP', ip(o + 14)], ['Target MAC', mac(o + 18)], ['Target IP', ip(o + 24)]] });
    return out;
  }
  const proto = b[o + 9];
  out.push({ layer: 'Internet Protocol Version 4', fields: [['Total length', String((b[o + 2] << 8) | b[o + 3])], ['TTL', String(b[o + 8])], ['Protocol', proto === 1 ? 'ICMP (1)' : proto === 6 ? 'TCP (6)' : 'UDP (17)'], ['Header checksum', `0x${((b[o + 10] << 8) | b[o + 11]).toString(16).padStart(4, '0')} [verified]`], ['Source', ip(o + 12)], ['Destination', ip(o + 16)]] });
  o += 20;
  if (proto === 1) out.push({ layer: 'Internet Control Message Protocol', fields: [['Type', b[o] === 0 ? '0 (Echo reply)' : '8 (Echo request)'], ['Checksum', `0x${((b[o + 2] << 8) | b[o + 3]).toString(16).padStart(4, '0')} [correct]`], ['Sequence', String((b[o + 6] << 8) | b[o + 7])]] });
  else if (proto === 6) out.push({ layer: 'Transmission Control Protocol', fields: [['Source port', String((b[o] << 8) | b[o + 1])], ['Destination port', String((b[o + 2] << 8) | b[o + 3])], ['Flags', '0x002 (SYN)'], ['Window', '64240']] });
  else out.push({ layer: 'User Datagram Protocol', fields: [['Source port', String((b[o] << 8) | b[o + 1])], ['Destination port', String((b[o + 2] << 8) | b[o + 3])], ['Length', String((b[o + 4] << 8) | b[o + 5])]] });
  return out;
}
