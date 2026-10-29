// Builds the designer document from what the platform reports.
// Simulated lab: full detail (ports, VLANs, firewall rules, leases, counters) read from the lab state,
//   so an injected fault shows up on the canvas exactly where it is.
// Live back end: only what GET /topology returns. Ports, MACs and routes the contract does not carry
//   are marked as inferred or left empty instead of being made up.
import type { Node as ApiNode, Topology } from '@/api/types';
import type { LabState } from '@/mock/lab';
import { ipConfig, VLAN_GATEWAYS } from '@/mock/lab';
import { DEFAULT_MODEL, ifaceFromTemplate, MODEL_BY_KEY } from './catalog';
import { macFor, maskToPrefix } from './net';
import { checkConnection } from './validate';
import type { Cable, CableType, Device, DeviceKind, FirewallRule, Iface, LabDoc, LabSite, Route, Vlan } from './types';

export const DEVICE_W = 128;
export const DEVICE_H = 104;

function pos(n: ApiNode): { x: number; y: number } {
  const x = Number(n.tags?.find((t) => t.startsWith('x:'))?.slice(2));
  const y = Number(n.tags?.find((t) => t.startsWith('y:'))?.slice(2));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function kindOf(n: ApiNode): { kind: DeviceKind; model: string } {
  const role = (n.role ?? '').toLowerCase();
  switch (n.kind) {
    case 'router':
      return { kind: 'router', model: 'isr4331' };
    case 'switch':
      return { kind: 'switch', model: 'c2960x24' };
    case 'firewall':
      return { kind: 'firewall', model: 'dec2750' };
    case 'cloud_resource':
      return n.consoles?.length ? { kind: 'vm', model: 'proxmox-vm' } : { kind: 'cloud', model: /365|internet|saas/.test(role) ? 'internet' : 'aws-vpc' };
    case 'container':
      return { kind: 'vm', model: 'proxmox-vm' };
    default:
      if (/laptop/.test(role)) return { kind: 'laptop', model: 'thinkpad' };
      if (/workstation|desktop|teller|dispatch/.test(role)) return { kind: 'pc', model: 'optiplex' };
      if (/camera|sensor|iot/.test(role)) return { kind: 'iot', model: 'axis-cam' };
      return { kind: 'server', model: 'r650' };
  }
}

const iface = (name: string, type: Iface['type'], extra: Partial<Iface> = {}): Iface => ({
  name,
  type,
  speeds: type === 'sfp' ? [1000] : type === 'virtual' ? [1000, 10000] : [10, 100, 1000],
  speed: 'auto',
  duplex: 'auto',
  mac: '',
  shutdown: false,
  ...extra,
});

function connectedRoutes(d: Device): Route[] {
  return d.interfaces.filter((i) => i.ip && i.prefix !== undefined).map((i) => {
    const parts = i.ip!.split('.').map(Number);
    const m = i.prefix!;
    const n = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    const mask = m === 0 ? 0 : (0xffffffff << (32 - m)) >>> 0;
    const b = (n & mask) >>> 0;
    return { prefix: `${(b >>> 24) & 255}.${(b >>> 16) & 255}.${(b >>> 8) & 255}.${b & 255}/${m}`, iface: i.name, kind: 'connected' as const };
  });
}

const LISTEN: Record<string, number[]> = {
  DC01: [53, 88, 135, 389, 445, 464, 636, 3389],
  DC02: [53, 88, 135, 389, 445, 636, 3389],
  FS01: [445, 3389],
  APP01: [22, 80, 443],
  DB01: [22, 5432],
  BKP01: [445, 3389],
  WAZUH01: [22, 443, 1514, 1515],
  'AWS-ALB': [80, 443],
  'AWS-APP': [22, 443],
  'KL-M365': [443, 25, 587],
};
const SERVICE_PORT: Record<string, Record<string, number[]>> = {
  DC01: { DNS: [53], KDC: [88, 464], NTDS: [389, 636, 135], Netlogon: [445] },
  DC02: { DNS: [53], KDC: [88], NTDS: [389, 636, 135], Netlogon: [445] },
  FS01: { LanmanServer: [445] },
  APP01: { nginx: [80, 443] },
  DB01: { postgresql: [5432] },
};

function listeningFor(name: string, lab?: LabState): number[] {
  const base = LISTEN[name] ?? (name.startsWith('WS-') || name.startsWith('KL-WS') ? [3389] : [22]);
  const svcs = lab?.nodes[name]?.services;
  if (!svcs || !SERVICE_PORT[name]) return base;
  const stopped = new Set(Object.entries(svcs).filter(([, s]) => s === 'Stopped').flatMap(([k]) => SERVICE_PORT[name][k] ?? []));
  return base.filter((p) => !stopped.has(p));
}

function fwFromLab(lab: LabState): FirewallRule[] {
  return lab.fwRules.map((r) => ({ ...r }));
}

/** Simulated lab: every port and setting comes from the lab state. */
function richInterfaces(n: ApiNode, kind: DeviceKind, model: string, lab: LabState): Partial<Device> {
  const name = n.name;
  const vm = 'bc:24:11';
  if (name === 'SW-ACC-01') {
    const m = MODEL_BY_KEY[model];
    const ports: Iface[] = m.ports().map((t): Iface => {
      const base = ifaceFromTemplate(t, name, m.macPrefix);
      const p = lab.switchPorts[t.name];
      if (!p) return { ...base, shutdown: t.type === 'sfp', mode: 'access' as const, vlan: 1 };
      return {
        ...base,
        mode: p.mode,
        vlan: p.mode === 'access' ? p.vlan : undefined,
        allowedVlans: p.mode === 'trunk' ? ('all' as const) : undefined,
        nativeVlan: p.mode === 'trunk' ? 1 : undefined,
        speed: p.speed === 'auto' ? ('auto' as const) : (Number(p.speed) as 100 | 1000),
        duplex: p.duplex,
        shutdown: p.shutdown,
        description: p.description || undefined,
        counters: { crc: p.crc, lateCollisions: p.lateCollisions, inputErrors: p.inputErrors },
      };
    });
    ports.push(iface('Vlan10', 'virtual', { mode: 'routed', vlan: 10, ip: '10.10.10.2', prefix: 24, gateway: '10.10.10.1', mac: macFor(`${name}/Vlan10`, m.macPrefix), description: 'Management SVI' }));
    return { interfaces: ports, vlans: { ...lab.vlans }, routes: [{ prefix: '0.0.0.0/0', via: '10.10.10.1', kind: 'default', description: 'ip default-gateway' }] };
  }
  if (name === 'FW01') {
    const m = MODEL_BY_KEY.dec2750;
    const mac = (p: string) => macFor(`${name}/${p}`, m.macPrefix);
    const ifs: Iface[] = [
      iface('igb0', 'copper', { mac: mac('igb0'), ip: '198.51.100.10', prefix: 29, alias: 'WAN', description: 'WAN (ISP hand-off)', mode: 'routed' }),
      iface('igb1', 'copper', { mac: mac('igb1'), mode: 'trunk', allowedVlans: 'all', nativeVlan: 1, description: 'LAN trunk to SW-ACC-01' }),
      ...Object.keys(VLAN_GATEWAYS).map((v) => iface(`igb1.${v}`, 'virtual', { parent: 'igb1', vlan: Number(v), ip: VLAN_GATEWAYS[Number(v)], prefix: 24, alias: `VLAN${v}`, mac: mac('igb1'), description: lab.vlans[Number(v)] ?? '', mode: 'routed' })),
      iface('igb2', 'copper', { mac: mac('igb2'), shutdown: true }),
      iface('igb3', 'copper', { mac: mac('igb3'), shutdown: true }),
      iface('ix0', 'sfp', { mac: mac('ix0'), speeds: [10000], shutdown: true }),
      iface('ix1', 'sfp', { mac: mac('ix1'), speeds: [10000], shutdown: true }),
      iface('wg0', 'virtual', { mac: '', ip: '10.255.255.1', prefix: 30, alias: 'WG_BO', description: 'WireGuard to Bo branch', mode: 'routed' }),
      iface('wg1', 'virtual', { mac: '', ip: '10.255.254.1', prefix: 30, alias: 'WG_AWS', description: 'WireGuard to AWS VPC', mode: 'routed' }),
      iface('Console', 'console', { speeds: [10], duplex: 'full' }),
    ];
    return {
      interfaces: ifs,
      vlans: { ...lab.vlans },
      firewall: fwFromLab(lab),
      routes: [
        { prefix: '10.20.0.0/16', via: '10.255.255.2', iface: 'wg0', kind: 'static', description: 'Bo branch over WireGuard' },
        { prefix: '10.30.0.0/16', via: '10.255.254.2', iface: 'wg1', kind: 'static', description: 'AWS VPC over WireGuard' },
        { prefix: '0.0.0.0/0', via: '198.51.100.9', iface: 'igb0', kind: 'default', description: 'ISP' },
      ],
    };
  }
  if (name === 'BO-RTR01') {
    const m = MODEL_BY_KEY.isr4331;
    const ifs = m.ports().map((t) => ifaceFromTemplate(t, name, m.macPrefix));
    const g0 = ifs.find((i) => i.name === 'Gi0/0/0')!;
    Object.assign(g0, { ip: '10.20.20.1', prefix: 24, mode: 'routed', description: 'Branch LAN' });
    ifs.splice(3, 0, iface('Tunnel0', 'virtual', { ip: '10.255.255.2', prefix: 30, description: 'WireGuard to FW01', mode: 'routed' }));
    return { interfaces: ifs, routes: [{ prefix: '0.0.0.0/0', via: '10.255.255.1', iface: 'Tunnel0', kind: 'default', description: 'Everything to HQ over the tunnel' }], vlans: {} };
  }
  if (name === 'KL-FW') {
    const m = MODEL_BY_KEY.dec2750;
    const mac = (p: string) => macFor(`${name}/${p}`, m.macPrefix);
    const ifs: Iface[] = [
      iface('igb0', 'copper', { mac: mac('igb0'), ip: '198.51.100.2', prefix: 30, alias: 'WAN', mode: 'routed', description: 'WAN' }),
      iface('igb1', 'copper', { mac: mac('igb1'), bridge: 'bridge0', description: 'LAN port 1' }),
      iface('igb2', 'copper', { mac: mac('igb2'), ip: '10.50.0.1', prefix: 24, alias: 'MGMT', mode: 'routed', description: 'Management' }),
      iface('igb3', 'copper', { mac: mac('igb3'), bridge: 'bridge0', description: 'LAN port 2' }),
      iface('bridge0', 'virtual', { mac: mac('bridge0'), ip: '10.50.20.1', prefix: 24, alias: 'LAN', mode: 'routed', description: 'LAN bridge (igb1 + igb3)' }),
      iface('Console', 'console', { speeds: [10], duplex: 'full' }),
    ];
    return {
      interfaces: ifs,
      firewall: [
        { id: 1, iface: 'LAN', src: '10.50.20.0/24', dst: 'any', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'Default allow LAN to any (factory rule)' },
        { id: 99, iface: 'any', src: 'any', dst: 'any', proto: 'any', port: 'any', action: 'block', log: true, enabled: true, descr: 'Default deny (logged)' },
      ],
      routes: [{ prefix: '0.0.0.0/0', via: '198.51.100.1', iface: 'igb0', kind: 'default', description: 'ISP' }],
      vlans: {},
    };
  }
  if (name === 'AWS-ALB') {
    return {
      interfaces: [
        iface('attach1', 'virtual', { ip: '10.255.254.2', prefix: 30, description: 'Site-to-site VPN attachment', mode: 'routed' }),
        iface('attach2', 'virtual', { ip: '10.30.1.10', prefix: 16, description: 'VPC subnets (10.30.0.0/16)', mode: 'routed' }),
        iface('attach3', 'virtual', { shutdown: true }),
        iface('attach4', 'virtual', { shutdown: true }),
      ],
      routes: [{ prefix: '0.0.0.0/0', via: '10.255.254.1', iface: 'attach1', kind: 'default', description: 'Back to HQ over the VPN' }],
      vlans: {},
    };
  }
  if (name === 'KL-M365') {
    return {
      interfaces: [iface('pe0', 'copper', { ip: '198.51.100.1', prefix: 30, description: 'Provider edge facing Kamara office', mode: 'routed' }), iface('svc0', 'virtual', { ip: '52.96.0.10', prefix: 16, description: 'Microsoft 365 front door', mode: 'routed' })],
      routes: [],
      vlans: {},
    };
  }
  // Hosts: address from the lab's view of the OS (DHCP lease, static, wrong gateway...).
  if (!lab.nodes[name]) return {};
  const cfg = ipConfig(lab, name);
  const prefix = maskToPrefix(cfg.mask) ?? 24;
  const st = lab.nodes[name];
  // Statically addressed hosts outside HQ use their own site's .1 gateway.
  if (!st.staticIp && !st.dhcp && cfg.ip && !cfg.ip.startsWith('10.10.')) cfg.gw = cfg.ip.replace(/\.\d+$/, '.1');
  const ifName = n.os === 'windows' ? 'Ethernet' : n.kind === 'cloud_resource' ? 'ens5' : 'eth0';
  const peerPort = Object.values(lab.switchPorts).find((p) => p.peer === name);
  const forcedPeer = peerPort && (peerPort.duplex !== 'auto' || peerPort.speed !== 'auto');
  const host = iface(ifName, n.kind === 'cloud_resource' ? 'virtual' : 'copper', {
    mac: macFor(`${name}/${ifName}`, vm),
    ip: cfg.ip,
    prefix,
    gateway: cfg.gw ?? undefined,
    dhcp: cfg.dhcp,
    vlan: n.vlan ?? undefined,
    // The lab reports this server NIC holding full duplex when the switch side is hard-set.
    duplex: forcedPeer ? 'full' : 'auto',
  });
  const extra: Iface[] = kind === 'pc' ? [iface('RS232', 'terminal', { speeds: [10], duplex: 'full' })] : [];
  return { interfaces: [host, ...extra], routes: [], vlans: {} };
}

/** Live back end: only reported facts. */
function genericDevice(n: ApiNode, kind: DeviceKind, model: string): Partial<Device> {
  const m = MODEL_BY_KEY[model];
  const ifs = m.ports().map((t) => ({ ...ifaceFromTemplate(t, n.id, m.macPrefix), mac: '', inferred: true }));
  if (n.mgmt_ip && /^\d+\.\d+\.\d+\.\d+$/.test(n.mgmt_ip)) {
    const target = ifs.find((i) => i.type === 'copper' || i.type === 'virtual');
    if (target) Object.assign(target, { ip: n.mgmt_ip, prefix: 24, vlan: n.vlan ?? undefined, description: 'Management address reported by the back end (prefix length assumed /24)' });
  }
  return { interfaces: ifs, routes: [], vlans: {} };
}

const MOCK_TYPES: Record<string, CableType> = { 'link:KL-FW--KL-M365': 'wan' };
const LINK_CABLE: Record<string, CableType> = { ethernet: 'straight', trunk: 'trunk', vpn: 'virtual', wan: 'wan', cloud: 'virtual' };

/** Which port each end of a reported link uses in the simulated lab. */
const MOCK_PORTS: Record<string, [string, string]> = {
  'link:FW01--SW-ACC-01': ['igb1', 'Gi0/24'],
  'link:FW01--BO-RTR01': ['wg0', 'Tunnel0'],
  'link:FW01--AWS-ALB': ['wg1', 'attach1'],
  'link:AWS-ALB--AWS-APP': ['attach2', 'ens5'],
  'link:BO-RTR01--WS-BO-01': ['Gi0/0/0', 'Ethernet'],
  'link:KL-FW--KL-WS-01': ['igb1', 'Ethernet'],
  'link:KL-FW--KL-WS-02': ['igb3', 'Ethernet'],
  'link:KL-FW--KL-M365': ['igb0', 'pe0'],
};

export function buildDoc(topo: Topology, lab?: LabState | null): LabDoc {
  const clientIds = [...new Set(topo.nodes.map((n) => n.client_id))];
  const offsets: Record<string, number> = {};
  let cursor = 0;
  for (const cid of clientIds) {
    offsets[cid] = cursor;
    const ys = topo.nodes.filter((n) => n.client_id === cid).map((n) => pos(n).y);
    cursor += Math.max(...ys, 0) + 240;
  }
  const devices: Device[] = topo.nodes.map((n) => {
    const { kind, model } = kindOf(n);
    const p = pos(n);
    const detail = lab ? richInterfaces(n, kind, model, lab) : genericDevice(n, kind, model);
    const d: Device = {
      id: n.id,
      nodeId: n.id,
      origin: 'inventory',
      name: n.name,
      kind,
      model,
      role: n.role,
      os: n.os,
      siteId: n.site_id,
      x: Math.round(p.x * 1.15),
      y: Math.round((p.y + offsets[n.client_id]) * 1.1),
      power: n.power ?? 'unknown',
      health: (n.health as Device['health']) ?? 'unknown',
      interfaces: detail.interfaces ?? genericDevice(n, kind, model).interfaces!,
      routes: [],
      vlans: detail.vlans ?? {},
      firewall: detail.firewall ?? [],
      listening: lab ? listeningFor(n.name, lab) : MODEL_BY_KEY[model ?? DEFAULT_MODEL[kind]].listening,
      consoles: n.consoles ?? [],
      mgmtIp: n.mgmt_ip && n.mgmt_ip !== '-' ? n.mgmt_ip : undefined,
      tags: n.tags?.filter((t) => !/^[xy]:/.test(t)),
    };
    d.routes = [...connectedRoutes(d), ...(detail.routes ?? [])];
    return d;
  });

  const byId = new Map(devices.map((d) => [d.id, d]));
  const cables: Cable[] = [];
  const used = new Set<string>();
  for (const l of topo.links) {
    const a = byId.get(l.a_node_id);
    const b = byId.get(l.b_node_id);
    if (!a || !b) continue;
    let pa: string | undefined;
    let pb: string | undefined;
    if (lab) {
      const mapped = MOCK_PORTS[l.id];
      if (mapped) [pa, pb] = mapped;
      else if (a.name === 'SW-ACC-01') {
        pa = Object.values(lab.switchPorts).find((p) => p.peer === b.name)?.name;
        pb = b.interfaces[0]?.name;
      }
    }
    const open = (d: Device) => d.interfaces.filter((i) => !used.has(`${d.id}/${i.name}`) && !i.parent && i.type !== 'console' && i.type !== 'terminal');
    // Tunnels prefer virtual interfaces; a router without one terminates the tunnel on a copper port.
    const free = (d: Device, want: CableType) => (want === 'virtual' ? open(d).find((i) => i.type === 'virtual' || d.kind === 'cloud' || d.kind === 'vm') : undefined)?.name ?? open(d).find((i) => i.type === 'copper' || i.type === 'virtual')?.name;
    const type = (lab && MOCK_TYPES[l.id]) || LINK_CABLE[l.kind] || 'straight';
    pa ??= free(a, type);
    pb ??= free(b, type);
    if (!pa || !pb) continue;
    used.add(`${a.id}/${pa}`);
    used.add(`${b.id}/${pb}`);
    // A reported link must never look invalid because of a port we had to infer: fall back to a cable that fits.
    const partial = { devices, cables } as unknown as LabDoc;
    const ends = [{ device: a.id, port: pa }, { device: b.id, port: pb }] as const;
    const fits = (t: CableType) => !checkConnection(partial, ends[0], ends[1], t).some((i) => i.severity === 'error');
    const chosen = [type, 'wan' as const, 'straight' as const, 'virtual' as const].find(fits) ?? type;
    cables.push({ id: `cable:${l.id}`, linkId: l.id, a: ends[0], b: ends[1], type: chosen, disabled: false, label: l.label });
  }

  const sites: LabSite[] = topo.sites.map((s) => ({ id: s.id, name: s.name, cidr: s.cidr ?? undefined, kind: (s.kind as LabSite['kind']) ?? 'hq', clientId: s.client_id }));
  const vlans: Vlan[] = lab
    ? Object.entries(lab.vlans).map(([id, name]) => ({ id: Number(id), name, subnet: VLAN_GATEWAYS[Number(id)] ? `10.10.${id}.0/24` : undefined, gateway: VLAN_GATEWAYS[Number(id)], siteId: sites.find((s) => s.name === 'Freetown HQ')?.id }))
    : [];
  const subnets = [
    ...vlans.filter((v) => v.subnet).map((v) => ({ cidr: v.subnet!, name: `${v.name} (VLAN ${v.id})`, vlan: v.id, siteId: v.siteId })),
    ...sites.filter((s) => s.cidr).map((s) => ({ cidr: s.cidr!, name: `${s.name} supernet`, siteId: s.id })),
  ];
  return { version: 1, devices, cables, sites, racks: [], vlans, subnets, groups: [], source: lab ? 'simulated-lab' : 'live-topology', generatedAt: new Date().toISOString() };
}

export function emptyDoc(): LabDoc {
  return { version: 1, devices: [], cables: [], sites: [], racks: [], vlans: [], subnets: [], groups: [], source: 'blank', generatedAt: new Date().toISOString() };
}
