// The simulated lab. Every command output, check and chat answer is computed from this state,
// so a fault and its fix behave the way they would on the real network.
import type { Client, Link, Node, Site } from '@/api/types';

/** Stable UUID-shaped id from a name, so ids survive reloads and match across tabs. */
export function uuidFor(name: string): string {
  const h = (seed: number) => {
    let x = 0x811c9dc5 ^ seed;
    for (let i = 0; i < name.length; i++) {
      x ^= name.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, '0');
  };
  const hex = h(1) + h(2) + h(3) + h(4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type Power = 'running' | 'stopped';

export interface PortCfg {
  name: string; // Gi0/1
  mode: 'access' | 'trunk';
  vlan: number;
  duplex: 'auto' | 'full' | 'half';
  speed: 'auto' | '100' | '1000';
  shutdown: boolean;
  description: string;
  peer?: string; // node name
  peerDuplex?: 'full';
  crc: number;
  lateCollisions: number;
  inputErrors: number;
}

export interface FwRule {
  id: number;
  iface: string; // VLAN20
  src: string; // VLAN20 net, host or any
  dst: string;
  proto: 'any' | 'tcp' | 'udp' | 'tcp/udp' | 'icmp';
  port: string; // any | 443 | 53,88,389
  action: 'pass' | 'block';
  log: boolean;
  enabled: boolean;
  descr: string;
}

export interface AdUser {
  sam: string;
  name: string;
  ou: string;
  enabled: boolean;
  locked: boolean;
  groups: string[];
  mfaRequired: boolean;
  mfaDevice?: string;
  badPwdCount: number;
  title?: string;
  passwordVersion: number;
  service?: boolean;
}

export interface DhcpScope {
  scopeId: string;
  vlan: number;
  router: string;
  dns: string[];
  start: string;
  end: string;
}

export interface Lease {
  ip: string;
  mask: string;
  gw: string | null;
  dns: string[];
  vlan: number | null;
  apipa: boolean;
}

export interface NodeState {
  name: string;
  power: Power;
  // endpoints
  dhcp?: boolean;
  staticIp?: { ip: string; mask: string; gw: string | null; dns: string[] };
  lease?: Lease;
  switchPort?: string; // on SW-ACC-01
  loggedOnUser?: string;
  tokenStale?: boolean; // group change not yet picked up by a new logon
  services?: Record<string, 'Running' | 'Stopped'>;
  serviceCredVersion?: Record<string, number>; // e.g. BackupAgent -> svc-backup password version in use
}

export interface LabState {
  nodes: Record<string, NodeState>;
  switchPorts: Record<string, PortCfg>;
  vlans: Record<number, string>;
  fwRules: FwRule[]; // running (applied)
  fwPending: FwRule[] | null; // edited, not yet applied
  fwDenyLog: { at: string; src: string; dst: string; port: number; rule: number }[];
  ad: { users: Record<string, AdUser>; groups: Record<string, { name: string; description: string }> };
  dhcp: Record<string, DhcpScope>;
  events4740: { at: string; user: string; caller: string }[];
  events4771: { at: string; user: string; ip: string }[];
  staleDevice: Record<string, boolean>; // device -> still using old password
  mfaResets: { user: string; device: string; at: string; verifiedFirst: boolean }[];
  counters: { switchClearedAt: string | null };
}

export interface StaticNode {
  name: string;
  client: 'salone-mutual' | 'kamara-logistics';
  site: string;
  kind: Node['kind'];
  os: Node['os'];
  role: string;
  ip: string;
  vlan?: number;
  consoles: Node['consoles'];
  specs: { vcpu: number; ram_gb: number; disk_gb: number };
  tags?: string[];
  x: number;
  y: number;
}

export const CLIENTS: (Omit<Client, 'health_summary'> & { slug: string })[] = [
  {
    id: uuidFor('client:salone-mutual'),
    slug: 'salone-mutual',
    name: 'Salone Mutual',
    sector: 'bank',
    sla_tier: 'gold',
    status: 'active',
    compliance: ['PCI DSS (lab exercise)', 'NIST CSF 2.0'],
  },
  {
    id: uuidFor('client:kamara-logistics'),
    slug: 'kamara-logistics',
    name: 'Kamara Logistics',
    sector: 'small_business',
    sla_tier: 'silver',
    status: 'onboarding',
    compliance: ['CIS Controls IG1 (lab exercise)'],
  },
];
export const clientIdBySlug = (slug: string) => CLIENTS.find((c) => c.slug === slug)!.id;

export const SITES: (Site & { client_slug: string })[] = [
  { id: uuidFor('site:sm-hq'), client_id: clientIdBySlug('salone-mutual'), client_slug: 'salone-mutual', name: 'Freetown HQ', cidr: '10.10.0.0/16', kind: 'hq' },
  { id: uuidFor('site:sm-bo'), client_id: clientIdBySlug('salone-mutual'), client_slug: 'salone-mutual', name: 'Bo branch', cidr: '10.20.0.0/16', kind: 'branch' },
  { id: uuidFor('site:sm-aws'), client_id: clientIdBySlug('salone-mutual'), client_slug: 'salone-mutual', name: 'AWS eu-west-1', cidr: '10.30.0.0/16', kind: 'cloud' },
  { id: uuidFor('site:kl-office'), client_id: clientIdBySlug('kamara-logistics'), client_slug: 'kamara-logistics', name: 'Kamara office', cidr: '10.50.0.0/16', kind: 'hq' },
];
const siteId = (key: string) => uuidFor(`site:${key}`);

const W = { vcpu: 2, ram_gb: 4, disk_gb: 64 };
export const STATIC_NODES: StaticNode[] = [
  { name: 'FW01', client: 'salone-mutual', site: 'sm-hq', kind: 'firewall', os: 'opnsense', role: 'Perimeter firewall (OPNsense)', ip: '10.10.10.1', vlan: 10, consoles: ['ssh', 'serial'], specs: { vcpu: 2, ram_gb: 4, disk_gb: 32 }, x: 495, y: 40 },
  { name: 'SW-ACC-01', client: 'salone-mutual', site: 'sm-hq', kind: 'switch', os: 'ios', role: 'Access switch', ip: '10.10.10.2', vlan: 10, consoles: ['ssh', 'serial'], specs: { vcpu: 1, ram_gb: 1, disk_gb: 1 }, x: 495, y: 200 },
  { name: 'DC01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Domain controller, DNS, DHCP', ip: '10.10.10.10', vlan: 10, consoles: ['rdp', 'ssh'], specs: { vcpu: 2, ram_gb: 6, disk_gb: 80 }, tags: ['tier0'], x: 240, y: 360 },
  { name: 'DC02', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Domain controller, DNS', ip: '10.10.10.11', vlan: 10, consoles: ['rdp', 'ssh'], specs: { vcpu: 2, ram_gb: 6, disk_gb: 80 }, tags: ['tier0'], x: 410, y: 360 },
  { name: 'FS01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'File server', ip: '10.10.30.15', vlan: 30, consoles: ['rdp', 'ssh'], specs: { vcpu: 2, ram_gb: 4, disk_gb: 500 }, x: 580, y: 360 },
  { name: 'APP01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'linux', role: 'SalonePay application', ip: '10.10.30.20', vlan: 30, consoles: ['ssh'], specs: { vcpu: 4, ram_gb: 8, disk_gb: 80 }, x: 750, y: 360 },
  { name: 'DB01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'linux', role: 'PostgreSQL (payments)', ip: '10.10.40.10', vlan: 40, consoles: ['ssh'], specs: { vcpu: 4, ram_gb: 16, disk_gb: 250 }, tags: ['crown-jewel'], x: 240, y: 480 },
  { name: 'BKP01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Backup server', ip: '10.10.70.15', vlan: 70, consoles: ['rdp', 'ssh'], specs: { vcpu: 2, ram_gb: 8, disk_gb: 2000 }, x: 410, y: 480 },
  { name: 'WAZUH01', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'linux', role: 'SIEM (Wazuh)', ip: '10.10.50.10', vlan: 50, consoles: ['ssh'], specs: { vcpu: 4, ram_gb: 16, disk_gb: 400 }, x: 580, y: 480 },
  { name: 'WS-FIN-02', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Finance workstation', ip: 'dhcp', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 330, y: 640 },
  { name: 'WS-FIN-07', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Finance workstation (spare)', ip: 'dhcp', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 500, y: 640 },
  { name: 'WS-OPS-03', client: 'salone-mutual', site: 'sm-hq', kind: 'vm', os: 'windows', role: 'Operations workstation', ip: 'dhcp', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 670, y: 640 },
  { name: 'BO-RTR01', client: 'salone-mutual', site: 'sm-bo', kind: 'router', os: 'ios', role: 'Branch router (WireGuard to HQ)', ip: '10.20.0.1', consoles: ['ssh', 'serial'], specs: { vcpu: 1, ram_gb: 1, disk_gb: 1 }, x: 1000, y: 40 },
  { name: 'WS-BO-01', client: 'salone-mutual', site: 'sm-bo', kind: 'vm', os: 'windows', role: 'Branch teller workstation', ip: '10.20.20.31', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 1000, y: 200 },
  { name: 'AWS-ALB', client: 'salone-mutual', site: 'sm-aws', kind: 'cloud_resource', os: 'cloud', role: 'Application load balancer', ip: '10.30.1.10', consoles: [], specs: { vcpu: 0, ram_gb: 0, disk_gb: 0 }, x: 0, y: 40 },
  { name: 'AWS-APP', client: 'salone-mutual', site: 'sm-aws', kind: 'cloud_resource', os: 'linux', role: 'SalonePay DR instance (EC2)', ip: '10.30.10.20', consoles: ['ssh'], specs: { vcpu: 2, ram_gb: 4, disk_gb: 30 }, x: 0, y: 200 },
  { name: 'KL-FW', client: 'kamara-logistics', site: 'kl-office', kind: 'firewall', os: 'opnsense', role: 'Office firewall', ip: '10.50.0.1', consoles: ['ssh'], specs: { vcpu: 1, ram_gb: 2, disk_gb: 16 }, x: 175, y: 40 },
  { name: 'KL-WS-01', client: 'kamara-logistics', site: 'kl-office', kind: 'vm', os: 'windows', role: 'Dispatch workstation', ip: '10.50.20.11', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 0, y: 200 },
  { name: 'KL-WS-02', client: 'kamara-logistics', site: 'kl-office', kind: 'vm', os: 'windows', role: 'Owner laptop', ip: '10.50.20.12', vlan: 20, consoles: ['rdp', 'ssh'], specs: W, x: 175, y: 200 },
  { name: 'KL-M365', client: 'kamara-logistics', site: 'kl-office', kind: 'cloud_resource', os: 'cloud', role: 'Microsoft 365 tenant', ip: '-', consoles: [], specs: { vcpu: 0, ram_gb: 0, disk_gb: 0 }, x: 400, y: 40 },
];
export const nodeId = (name: string) => uuidFor(`node:${name}`);
export const nodeByName = (name: string) => STATIC_NODES.find((n) => n.name === name);
export const nodeById = (id: string) => STATIC_NODES.find((n) => nodeId(n.name) === id);

export const LINKS: (Omit<Link, 'state'> & { a: string; b: string })[] = [
  ['FW01', 'SW-ACC-01', 'trunk', 'Gi0/24 trunk'],
  ['SW-ACC-01', 'DC01', 'ethernet', 'Gi0/1'],
  ['SW-ACC-01', 'DC02', 'ethernet', 'Gi0/2'],
  ['SW-ACC-01', 'FS01', 'ethernet', 'Gi0/3'],
  ['SW-ACC-01', 'APP01', 'ethernet', 'Gi0/4'],
  ['SW-ACC-01', 'DB01', 'ethernet', 'Gi0/6'],
  ['SW-ACC-01', 'BKP01', 'ethernet', 'Gi0/7'],
  ['SW-ACC-01', 'WAZUH01', 'ethernet', 'Gi0/8'],
  ['SW-ACC-01', 'WS-FIN-02', 'ethernet', 'Gi0/5'],
  ['SW-ACC-01', 'WS-FIN-07', 'ethernet', 'Gi0/10'],
  ['SW-ACC-01', 'WS-OPS-03', 'ethernet', 'Gi0/12'],
  ['FW01', 'BO-RTR01', 'vpn', 'WireGuard'],
  ['BO-RTR01', 'WS-BO-01', 'ethernet', 'Gi0/1'],
  ['FW01', 'AWS-ALB', 'vpn', 'WireGuard to VPC'],
  ['AWS-ALB', 'AWS-APP', 'cloud', 'Target group'],
  ['KL-FW', 'KL-WS-01', 'ethernet', 'LAN'],
  ['KL-FW', 'KL-WS-02', 'ethernet', 'LAN'],
  ['KL-FW', 'KL-M365', 'cloud', 'Internet'],
].map(([a, b, kind, label]) => ({
  id: `link:${a}--${b}`,
  a: a as string,
  b: b as string,
  a_node_id: nodeId(a as string),
  b_node_id: nodeId(b as string),
  kind: kind as Link['kind'],
  label: label as string,
}));

export const VLAN_GATEWAYS: Record<number, string> = {
  10: '10.10.10.1',
  20: '10.10.20.1',
  30: '10.10.30.1',
  40: '10.10.40.1',
  50: '10.10.50.1',
  60: '10.10.60.1',
  70: '10.10.70.1',
  80: '10.10.80.1',
  90: '10.10.90.1',
};

export const BASE_RULES: FwRule[] = [
  { id: 1, iface: 'VLAN10', src: 'VLAN10 net', dst: 'any', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'Management and identity to anywhere' },
  { id: 10, iface: 'VLAN20', src: 'VLAN20 net', dst: '10.10.30.20', proto: 'tcp', port: '443', action: 'pass', log: false, enabled: true, descr: 'Users to SalonePay (HTTPS)' },
  { id: 11, iface: 'VLAN20', src: 'VLAN20 net', dst: '10.10.30.15', proto: 'tcp', port: '445', action: 'pass', log: false, enabled: true, descr: 'Users to file shares (SMB)' },
  { id: 12, iface: 'VLAN20', src: 'VLAN20 net', dst: 'VLAN10 net', proto: 'tcp/udp', port: '53,88,135,389,445,464,636', action: 'pass', log: false, enabled: true, descr: 'Users to domain controllers' },
  { id: 13, iface: 'VLAN30', src: '10.10.30.20', dst: '10.10.40.10', proto: 'tcp', port: '5432', action: 'pass', log: false, enabled: true, descr: 'SalonePay app to payments DB' },
  { id: 15, iface: 'VLAN30', src: 'VLAN30 net', dst: 'VLAN10 net', proto: 'tcp/udp', port: '53,88,389,445', action: 'pass', log: false, enabled: true, descr: 'Servers to domain controllers' },
  { id: 16, iface: 'VLAN70', src: '10.10.70.15', dst: 'any', proto: 'tcp', port: '445,88,389', action: 'pass', log: false, enabled: true, descr: 'Backup server to sources' },
  { id: 17, iface: 'VLAN50', src: 'VLAN50 net', dst: 'any', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'SIEM collectors' },
  { id: 20, iface: 'VLAN80', src: 'VLAN80 net', dst: '!RFC1918', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'Guest to internet only' },
  { id: 99, iface: 'any', src: 'any', dst: 'any', proto: 'any', port: 'any', action: 'block', log: true, enabled: true, descr: 'Default deny (logged)' },
];

function adUser(sam: string, name: string, ou: string, groups: string[], extra: Partial<AdUser> = {}): AdUser {
  return { sam, name, ou, enabled: true, locked: false, groups, mfaRequired: true, mfaDevice: 'Authenticator (registered phone)', badPwdCount: 0, passwordVersion: 1, ...extra };
}

export function initialLab(): LabState {
  const ports: Record<string, PortCfg> = {};
  const peers: Record<string, string> = {
    'Gi0/1': 'DC01', 'Gi0/2': 'DC02', 'Gi0/3': 'FS01', 'Gi0/4': 'APP01', 'Gi0/5': 'WS-FIN-02', 'Gi0/6': 'DB01',
    'Gi0/7': 'BKP01', 'Gi0/8': 'WAZUH01', 'Gi0/10': 'WS-FIN-07', 'Gi0/12': 'WS-OPS-03', 'Gi0/24': 'FW01',
  };
  for (let i = 1; i <= 24; i++) {
    const name = `Gi0/${i}`;
    const peer = peers[name];
    const n = peer ? nodeByName(peer) : undefined;
    ports[name] = {
      name,
      mode: i === 24 ? 'trunk' : 'access',
      vlan: i === 24 ? 1 : n?.vlan ?? 99,
      duplex: 'auto',
      speed: 'auto',
      shutdown: !peer,
      description: peer ? (i === 24 ? 'Uplink to FW01' : `${peer}`) : '',
      peer,
      peerDuplex: peer ? 'full' : undefined,
      crc: 0,
      lateCollisions: 0,
      inputErrors: 0,
    };
  }
  const nodes: Record<string, NodeState> = {};
  for (const n of STATIC_NODES) {
    const st: NodeState = { name: n.name, power: 'running' };
    if (n.ip === 'dhcp') {
      st.dhcp = true;
      st.switchPort = Object.entries(peers).find(([, p]) => p === n.name)?.[0];
    }
    nodes[n.name] = st;
  }
  nodes['WS-FIN-02'].loggedOnUser = 'iconteh';
  nodes['WS-FIN-07'].loggedOnUser = '';
  nodes['WS-OPS-03'].loggedOnUser = 'mkanu';
  nodes.DC01.services = { DNS: 'Running', Netlogon: 'Running', NTDS: 'Running', DHCPServer: 'Running', KDC: 'Running' };
  nodes.DC02.services = { DNS: 'Running', Netlogon: 'Running', NTDS: 'Running', KDC: 'Running' };
  nodes.FS01.services = { LanmanServer: 'Running' };
  nodes.APP01.services = { salonepay: 'Running', nginx: 'Running' };
  nodes.DB01.services = { postgresql: 'Running' };
  nodes.BKP01.services = { BackupAgent: 'Running' };
  nodes.BKP01.serviceCredVersion = { BackupAgent: 1 };
  nodes.WAZUH01.services = { 'wazuh-manager': 'Running', 'wazuh-indexer': 'Running' };

  const users: Record<string, AdUser> = {};
  for (const u of [
    adUser('iconteh', 'Ibrahim Conteh', 'OU=Finance,OU=Staff', ['GG-Finance', 'GG-AllStaff'], { title: 'Senior Accountant' }),
    adUser('abangura', 'Abu Bangura', 'OU=Finance,OU=Staff', ['GG-Finance', 'GG-Managers', 'GG-AllStaff'], { title: 'Finance Manager', mfaDevice: 'Authenticator (phone ending 4417)' }),
    adUser('mkanu', 'Mariama Kanu', 'OU=Operations,OU=Staff', ['GG-Operations', 'GG-AllStaff'], { title: 'Operations Coordinator' }),
    adUser('jdavies', 'John Davies', 'OU=Operations,OU=Staff', ['GG-Operations', 'GG-AllStaff'], { title: 'Logistics Supervisor', passwordVersion: 2 }),
    adUser('fsesay', 'Fatmata Sesay', 'OU=HR,OU=Staff', ['GG-HR', 'GG-AllStaff'], { title: 'HR Officer' }),
    adUser('mturay', 'Musa Turay', 'OU=Audit,OU=Staff', ['GG-Audit', 'GG-AllStaff'], { title: 'Internal Auditor' }),
    adUser('jkamara', 'Joseph Kamara', 'OU=IT,OU=Staff', ['GG-IT', 'GG-AllStaff'], { title: 'Systems Engineer' }),
    adUser('adm-jkamara', 'Joseph Kamara (Tier 1 admin)', 'OU=Tier1,OU=Admins', ['GG-Tier1-Admins'], { title: 'Tier 1 admin account' }),
    adUser('svc-backup', 'Backup service', 'OU=Service,OU=Accounts', ['GG-Backup-Operators'], { mfaRequired: false, mfaDevice: undefined, service: true, passwordVersion: 1 }),
  ])
    users[u.sam] = u;
  const groups: LabState['ad']['groups'] = {
    'GG-Finance': { name: 'GG-Finance', description: 'Finance staff. Modify on \\\\FS01\\Finance' },
    'GG-Operations': { name: 'GG-Operations', description: 'Operations staff. Modify on \\\\FS01\\Operations' },
    'GG-HR': { name: 'GG-HR', description: 'HR staff. Modify on \\\\FS01\\HR' },
    'GG-Audit': { name: 'GG-Audit', description: 'Audit, read-only on all shares' },
    'GG-IT': { name: 'GG-IT', description: 'IT staff (standard accounts)' },
    'GG-Managers': { name: 'GG-Managers', description: 'People managers' },
    'GG-AllStaff': { name: 'GG-AllStaff', description: 'Everyone' },
    'GG-Tier1-Admins': { name: 'GG-Tier1-Admins', description: 'Server administrators (Tier 1)' },
    'GG-Backup-Operators': { name: 'GG-Backup-Operators', description: 'Backup service accounts' },
  };
  return {
    nodes,
    switchPorts: ports,
    vlans: { 1: 'default', 10: 'MGMT', 20: 'USERS', 30: 'SERVERS', 40: 'DATABASE', 50: 'SECURITY', 60: 'DMZ', 70: 'BACKUP', 80: 'GUEST', 90: 'DEV', 99: 'UNUSED' },
    fwRules: structuredClone(BASE_RULES),
    fwPending: null,
    fwDenyLog: [],
    ad: { users, groups },
    dhcp: {
      '10.10.20.0': { scopeId: '10.10.20.0', vlan: 20, router: '10.10.20.1', dns: ['10.10.10.10', '10.10.10.11'], start: '10.10.20.40', end: '10.10.20.199' },
      '10.10.80.0': { scopeId: '10.10.80.0', vlan: 80, router: '10.10.80.1', dns: ['1.1.1.1'], start: '10.10.80.20', end: '10.10.80.250' },
    },
    events4740: [],
    events4771: [],
    staleDevice: {},
    mfaResets: [],
    counters: { switchClearedAt: null },
  };
}

// ---------- derived network behaviour ----------

const HOST_OCTET: Record<string, number> = { 'WS-FIN-02': 45, 'WS-FIN-07': 52, 'WS-OPS-03': 61 };

export function computeLease(lab: LabState, name: string): Lease {
  const st = lab.nodes[name];
  const port = st.switchPort ? lab.switchPorts[st.switchPort] : undefined;
  const vlan = port && !port.shutdown ? port.vlan : null;
  const scope = Object.values(lab.dhcp).find((s) => s.vlan === vlan);
  const dhcpUp = isServiceUp(lab, 'DC01', 'DHCPServer');
  if (!scope || !dhcpUp) {
    const oct = (HOST_OCTET[name] ?? 77) + 100;
    return { ip: `169.254.${oct}.${(oct * 7) % 250}`, mask: '255.255.0.0', gw: null, dns: [], vlan, apipa: true };
  }
  const base = scope.scopeId.split('.').slice(0, 3).join('.');
  return { ip: `${base}.${HOST_OCTET[name] ?? 90}`, mask: '255.255.255.0', gw: scope.router, dns: [...scope.dns], vlan, apipa: false };
}

export function renewLease(lab: LabState, name: string): Lease {
  const l = computeLease(lab, name);
  lab.nodes[name].lease = l;
  return l;
}

/** Effective IP configuration of any node, as the OS would report it. */
export function ipConfig(lab: LabState, name: string): { ip: string; mask: string; gw: string | null; dns: string[]; dhcp: boolean; apipa: boolean; vlan: number | null } {
  const st = lab.nodes[name];
  const sn = nodeByName(name)!;
  if (st.staticIp) return { ...st.staticIp, dhcp: false, apipa: false, vlan: sn.vlan ?? null };
  if (st.dhcp) {
    const l = st.lease ?? renewLease(lab, name);
    return { ip: l.ip, mask: l.mask, gw: l.gw, dns: l.dns, dhcp: true, apipa: l.apipa, vlan: l.vlan };
  }
  const vlan = sn.vlan ?? null;
  const gw = vlan ? VLAN_GATEWAYS[vlan] ?? null : sn.ip.replace(/\.\d+$/, '.1');
  return { ip: sn.ip, mask: '255.255.255.0', gw, dns: ['10.10.10.10', '10.10.10.11'], dhcp: false, apipa: false, vlan };
}

export function isServiceUp(lab: LabState, node: string, svc: string): boolean {
  const st = lab.nodes[node];
  return st?.power === 'running' && (st.services?.[svc] ?? 'Running') === 'Running';
}

const sameNet = (a: string, b: string, mask: string) => mask === '255.255.0.0' ? a.split('.').slice(0, 2).join('.') === b.split('.').slice(0, 2).join('.') : a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');

export function vlanOfIp(ip: string): number | null {
  const m = /^10\.10\.(\d+)\./.exec(ip);
  return m ? Number(m[1]) : null;
}

function addrMatches(spec: string, ip: string, vlan: number | null): boolean {
  if (spec === 'any') return true;
  if (spec === '!RFC1918') return !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const net = /^VLAN(\d+) net$/.exec(spec);
  if (net) return vlan === Number(net[1]);
  return spec === ip;
}

function portMatches(spec: string, port: number): boolean {
  return spec === 'any' || spec.split(',').map(Number).includes(port);
}

export interface FwVerdict {
  action: 'pass' | 'block';
  rule: FwRule;
}

export function evalFirewall(lab: LabState, srcIp: string, dstIp: string, port: number, proto: 'tcp' | 'udp' | 'icmp' = 'tcp'): FwVerdict {
  const sv = vlanOfIp(srcIp);
  const dv = vlanOfIp(dstIp);
  for (const r of lab.fwRules) {
    if (!r.enabled) continue;
    if (r.iface !== 'any' && r.iface !== `VLAN${sv}`) continue;
    if (!addrMatches(r.src, srcIp, sv) || !addrMatches(r.dst, dstIp, dv)) continue;
    if (r.proto !== 'any' && !(r.proto === proto || (r.proto === 'tcp/udp' && proto !== 'icmp'))) continue;
    if (proto !== 'icmp' && !portMatches(r.port, port)) continue;
    if (proto === 'icmp' && r.port !== 'any' && r.proto !== 'icmp') continue;
    return { action: r.action, rule: r };
  }
  return { action: 'block', rule: lab.fwRules.find((r) => r.id === 99)! };
}

const SERVICE_PORTS: Record<string, Record<number, string>> = {
  DC01: { 53: 'DNS', 88: 'KDC', 389: 'NTDS', 636: 'NTDS', 445: 'Netlogon', 135: 'NTDS', 464: 'KDC' },
  DC02: { 53: 'DNS', 88: 'KDC', 389: 'NTDS', 636: 'NTDS', 445: 'Netlogon', 135: 'NTDS' },
  FS01: { 445: 'LanmanServer' },
  APP01: { 443: 'nginx', 80: 'nginx' },
  DB01: { 5432: 'postgresql' },
  WAZUH01: { 1514: 'wazuh-manager', 55000: 'wazuh-manager', 9200: 'wazuh-indexer' },
};

export function nodeByIp(lab: LabState, ip: string): string | undefined {
  for (const n of STATIC_NODES) {
    const c = ipConfig(lab, n.name);
    if (c.ip === ip) return n.name;
  }
  return undefined;
}

export type ReachResult =
  | { ok: true; hops: string[]; verdict?: FwVerdict }
  | { ok: false; reason: 'no_ip' | 'no_route' | 'host_down' | 'filtered' | 'refused' | 'link_down'; hops: string[]; verdict?: FwVerdict };

/** Can `src` open `port` on `dstIp`? Same logic the checks and the live map use. */
export function reach(lab: LabState, src: string, dstIp: string, port: number, proto: 'tcp' | 'udp' | 'icmp' = 'tcp'): ReachResult {
  const c = ipConfig(lab, src);
  const srcSt = lab.nodes[src];
  if (srcSt.power !== 'running') return { ok: false, reason: 'host_down', hops: [] };
  if (c.apipa || !c.ip) return { ok: false, reason: 'no_ip', hops: [] };
  if (srcSt.switchPort) {
    const p = lab.switchPorts[srcSt.switchPort];
    if (p.shutdown) return { ok: false, reason: 'link_down', hops: [] };
  }
  const dstName = nodeByIp(lab, dstIp);
  const hops: string[] = [];
  const local = sameNet(c.ip, dstIp, c.mask);
  let verdict: FwVerdict | undefined;
  if (!local) {
    const expectedGw = c.vlan ? VLAN_GATEWAYS[c.vlan] : null;
    if (!c.gw || (expectedGw && c.gw !== expectedGw)) return { ok: false, reason: 'no_route', hops: [] };
    hops.push(c.gw);
    verdict = evalFirewall(lab, c.ip, dstIp, port, proto);
    if (verdict.action === 'block') {
      if (verdict.rule.log) lab.fwDenyLog.push({ at: new Date().toISOString(), src: c.ip, dst: dstIp, port, rule: verdict.rule.id });
      if (lab.fwDenyLog.length > 200) lab.fwDenyLog.splice(0, lab.fwDenyLog.length - 200);
      return { ok: false, reason: 'filtered', hops, verdict };
    }
  }
  if (!dstName) return local ? { ok: false, reason: 'host_down', hops } : { ok: true, hops: [...hops, dstIp], verdict };
  const dst = lab.nodes[dstName];
  if (dst.power !== 'running') return { ok: false, reason: 'host_down', hops, verdict };
  if (dst.switchPort && lab.switchPorts[dst.switchPort]?.shutdown) return { ok: false, reason: 'host_down', hops, verdict };
  if (proto === 'icmp') return { ok: true, hops: [...hops, dstIp], verdict };
  const svc = SERVICE_PORTS[dstName]?.[port];
  if (!svc || !isServiceUp(lab, dstName, svc)) return { ok: false, reason: 'refused', hops: [...hops, dstIp], verdict };
  return { ok: true, hops: [...hops, dstIp], verdict };
}

export const DNS_ZONE: Record<string, string> = {
  'dc01.corp.salonemutual.lab': '10.10.10.10',
  'dc02.corp.salonemutual.lab': '10.10.10.11',
  'corp.salonemutual.lab': '10.10.10.10',
  'fs01.corp.salonemutual.lab': '10.10.30.15',
  'salonepay.corp.salonemutual.lab': '10.10.30.20',
  'app01.corp.salonemutual.lab': '10.10.30.20',
  'db01.corp.salonemutual.lab': '10.10.40.10',
  'bkp01.corp.salonemutual.lab': '10.10.70.15',
  'wazuh01.corp.salonemutual.lab': '10.10.50.10',
  'www.google.com': '142.250.200.4',
  'google.com': '142.250.200.4',
};

export function qualify(name: string): string {
  const n = name.toLowerCase().replace(/\.$/, '');
  if (n.includes('.')) return n;
  return `${n}.corp.salonemutual.lab`;
}

export type Resolve = { ok: true; ip: string; server: string } | { ok: false; reason: 'no_server' | 'timeout' | 'nxdomain'; server: string | null };

export function resolveName(lab: LabState, src: string, name: string): Resolve {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return { ok: true, ip: name, server: '-' };
  const c = ipConfig(lab, src);
  if (!c.dns.length) return { ok: false, reason: 'no_server', server: null };
  for (const server of c.dns) {
    const dnsNode = nodeByIp(lab, server);
    if (!dnsNode || !isServiceUp(lab, dnsNode, 'DNS')) continue;
    const r = reach(lab, src, server, 53, 'udp');
    if (!r.ok) continue;
    const fq = qualify(name);
    const ip = DNS_ZONE[fq];
    if (!ip) return { ok: false, reason: 'nxdomain', server };
    return { ok: true, ip, server };
  }
  return { ok: false, reason: 'timeout', server: c.dns[0] };
}

export function anyLogonServer(lab: LabState): string | null {
  for (const dc of ['DC01', 'DC02']) if (isServiceUp(lab, dc, 'Netlogon') && isServiceUp(lab, dc, 'DNS')) return dc;
  for (const dc of ['DC01', 'DC02']) if (isServiceUp(lab, dc, 'Netlogon') && (isServiceUp(lab, 'DC01', 'DNS') || isServiceUp(lab, 'DC02', 'DNS'))) return dc;
  return null;
}

export function duplexMismatch(lab: LabState, port: string): boolean {
  const p = lab.switchPorts[port];
  if (!p?.peer || p.shutdown) return false;
  const eff = p.duplex === 'auto' ? 'full' : p.duplex;
  return eff !== (p.peerDuplex ?? 'full');
}

export function effectiveSpeed(p: PortCfg): string {
  if (p.speed !== 'auto') return p.speed === '1000' ? '1000' : '100';
  return '1000';
}

export function hasAccess(lab: LabState, sam: string, share: string): boolean {
  const u = lab.ad.users[sam];
  if (!u || !u.enabled || u.locked) return false;
  const need: Record<string, string> = { Finance: 'GG-Finance', Operations: 'GG-Operations', HR: 'GG-HR' };
  return u.groups.includes(need[share] ?? '') || u.groups.includes('GG-Audit');
}

export function nodeHealth(lab: LabState, name: string): Node['health'] {
  const st = lab.nodes[name];
  if (!st) return 'unknown';
  if (st.power !== 'running') return 'down';
  const sn = nodeByName(name)!;
  if (st.services && Object.values(st.services).some((s) => s === 'Stopped')) return name.startsWith('DC') ? 'down' : 'degraded';
  if (st.dhcp) {
    const c = ipConfig(lab, name);
    if (c.apipa) return 'degraded';
  }
  if (st.staticIp && sn.vlan && st.staticIp.gw !== VLAN_GATEWAYS[sn.vlan]) return 'degraded';
  if (name === 'SW-ACC-01' && Object.keys(lab.switchPorts).some((p) => duplexMismatch(lab, p))) return 'degraded';
  if (name === 'FS01' && duplexMismatch(lab, 'Gi0/3')) return 'degraded';
  if (name === 'FW01' && lab.fwRules.some((r) => r.enabled && r.iface === 'VLAN20' && r.dst === 'VLAN40 net')) return 'degraded';
  if (name === 'BKP01' && (st.serviceCredVersion?.BackupAgent ?? 0) !== lab.ad.users['svc-backup'].passwordVersion) return 'degraded';
  return 'healthy';
}
