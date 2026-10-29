// The lab designer's model. One document describes every device, interface, cable, site, rack,
// VLAN and subnet on the canvas. Inventory devices mirror nodes the back end reports; design
// devices exist only in the document until someone builds them in the real lab.

export type DeviceKind = 'router' | 'switch' | 'firewall' | 'server' | 'pc' | 'laptop' | 'ap' | 'cloud' | 'vm' | 'iot';

/** Physical or logical port family. Decides which cables fit. */
export type PortType = 'copper' | 'sfp' | 'serial' | 'console' | 'terminal' | 'wireless' | 'virtual';

export type Speed = 'auto' | 10 | 100 | 1000 | 10000;
export type Duplex = 'auto' | 'full' | 'half';

export interface Iface {
  name: string; // Gi0/12, igb1, Ethernet, net0
  type: PortType;
  /** Speeds the hardware supports, fastest last. */
  speeds: Exclude<Speed, 'auto'>[];
  speed: Speed;
  duplex: Duplex;
  mac: string;
  shutdown: boolean;
  description?: string;
  /** Switch ports */
  mode?: 'access' | 'trunk' | 'routed';
  vlan?: number; // access VLAN or the VLAN a host sits in
  allowedVlans?: number[] | 'all';
  nativeVlan?: number;
  /** Layer 3 */
  ip?: string;
  prefix?: number;
  gateway?: string;
  dhcp?: boolean;
  /** Sub-interface of a trunk parent (router-on-a-stick / firewall VLAN interface) */
  parent?: string;
  /** Member of a software bridge (the bridge interface holds the IP), e.g. OPNsense bridge0 */
  bridge?: string;
  /** Firewall rule interface alias, e.g. VLAN20 */
  alias?: string;
  /** Live error counters (from the lab when it reports them) */
  counters?: { crc: number; lateCollisions: number; inputErrors: number };
  /** True when the port exists only because the back end did not report interfaces. */
  inferred?: boolean;
  /** MTU in bytes (default 1500). OSPF neighbours stall in EXSTART when MTUs differ. */
  mtu?: number;
  /** DNS servers handed out or configured on a host */
  dns?: string[];
  /** OSPF on this interface */
  ospf?: { area: number; cost?: number; passive?: boolean; hello?: number; dead?: number };
  /** First-hop redundancy (HSRP) */
  hsrp?: { group: number; vip: string; priority: number; preempt: boolean };
  /** NAT role */
  nat?: 'inside' | 'outside';
  /** DHCP relay target (ip helper-address) */
  helper?: string;
  /** EtherChannel membership */
  channelGroup?: number;
  channelMode?: 'active' | 'passive' | 'on' | 'desirable' | 'auto';
  /** Spanning-tree portfast (edge port) */
  portfast?: boolean;
}

export interface DhcpPool {
  name: string;
  network: string; // 10.10.20.0/24
  gateway?: string;
  dns?: string[];
  start: string;
  end: string;
}

export interface WirelessConfig {
  ssid: string;
  security: 'open' | 'wpa2' | 'wpa3';
  key?: string;
  channel?: number;
}

export interface Route {
  prefix: string; // 10.20.0.0/16 or 0.0.0.0/0
  via?: string; // next-hop IP
  iface?: string; // egress interface name
  kind: 'connected' | 'static' | 'default' | 'ospf';
  description?: string;
  /** Learned routes: metric, administrative distance and IOS route code (C, S, S*, O, O IA, O*E2) */
  metric?: number;
  ad?: number;
  code?: string;
}

export interface FirewallRule {
  id: number;
  iface: string; // alias (VLAN20) or 'any'
  src: string; // any | VLAN20 net | 10.10.30.20 | 10.10.0.0/16 | !RFC1918
  dst: string;
  proto: 'any' | 'tcp' | 'udp' | 'tcp/udp' | 'icmp';
  port: string; // any | 443 | 53,88,389
  action: 'pass' | 'block';
  log: boolean;
  enabled: boolean;
  descr: string;
}

export type Health = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface Device {
  id: string;
  /** Back-end node id for inventory devices. Absent for design-only devices. */
  nodeId?: string;
  origin: 'inventory' | 'design';
  name: string;
  kind: DeviceKind;
  model: string; // catalog key
  role?: string;
  os?: string;
  siteId?: string;
  rack?: { rackId: string; u: number };
  groupId?: string;
  x: number;
  y: number;
  power: 'running' | 'stopped' | 'unknown';
  health: Health;
  interfaces: Iface[];
  routes: Route[];
  vlans: Record<number, string>; // VLAN database (switches) or VLANs known to the device
  firewall: FirewallRule[];
  /** TCP/UDP ports a host answers on, for packet simulation */
  listening: number[];
  consoles: ('ssh' | 'rdp' | 'vnc' | 'serial')[];
  mgmtIp?: string;
  tags?: string[];
  notes?: string;
  /** Spanning tree (switches) */
  stp?: { enabled: boolean; priority: number };
  /** OSPF process */
  ospfProcess?: { routerId?: string; defaultOriginate?: boolean };
  /** PAT: translate inside traffic to the address of this outside interface */
  natOverload?: { outside: string };
  dhcpPools?: DhcpPool[];
  /** Access point radio (ap) or client profile (laptop, iot) */
  wireless?: WirelessConfig;
  /** Management-plane hardening, checked by the audit */
  security?: { ssh: boolean; telnet: boolean; enableSecret: boolean; banner?: string };
  /** Saved configuration (write memory) for the CLI */
  startupSaved?: string;
  /** Why a device is off when power comes from elsewhere (PoE) */
  powerReason?: string;
}

export type CableType = 'straight' | 'crossover' | 'fiber' | 'serial' | 'console' | 'trunk' | 'access' | 'wan' | 'virtual';

export interface CableEnd {
  device: string; // Device.id
  port: string; // Iface.name
}

export interface Cable {
  id: string;
  a: CableEnd;
  b: CableEnd;
  type: CableType;
  disabled: boolean;
  /** Back-end link id, when this cable mirrors a reported link (used for live flows). */
  linkId?: string;
  label?: string;
  /** Optional bend point the operator dragged, in canvas coordinates. */
  bend?: { x: number; y: number };
  wan?: { provider?: string; bandwidthMbps?: number; latencyMs?: number };
  /** Physical length in metres (copper is limited to 100 m) */
  lengthM?: number;
  /** Fibre type */
  fiberMode?: 'mmf' | 'smf';
  /** Link conditioning (CML-style impairment) */
  cond?: { enabled: boolean; latencyMs?: number; jitterMs?: number; lossPct?: number; bandwidthMbps?: number };
}

export interface Annotation {
  id: string;
  kind: 'text' | 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: 'blue' | 'green' | 'amber' | 'red' | 'grey';
}

export interface Goal {
  id: string;
  src: string; // device id
  dst: string; // device id or IP
  proto: 'icmp' | 'tcp' | 'udp';
  port?: number;
  expect: 'reach' | 'blocked';
  note?: string;
}

export interface LabSite {
  id: string;
  name: string;
  cidr?: string;
  kind: 'hq' | 'branch' | 'cloud' | 'datacenter' | 'remote';
  clientId?: string;
}

export interface Rack {
  id: string;
  siteId: string;
  name: string;
  units: number;
}

export interface Vlan {
  id: number;
  name: string;
  subnet?: string; // 10.10.20.0/24
  gateway?: string;
  siteId?: string;
}

export interface Subnet {
  cidr: string;
  name: string;
  vlan?: number;
  siteId?: string;
}

export interface Group {
  id: string;
  name: string;
}

export interface LabDoc {
  version: 1;
  devices: Device[];
  cables: Cable[];
  sites: LabSite[];
  racks: Rack[];
  vlans: Vlan[];
  subnets: Subnet[];
  groups: Group[];
  annotations?: Annotation[];
  goals?: Goal[];
  /** Active troubleshooting challenge (the fault is hidden until revealed) */
  challenge?: { id: string; title: string; brief: string; startedAt: string; revealed: boolean; fault: string };
  /** Where the inventory part came from, for honesty labels. */
  source: 'simulated-lab' | 'live-topology' | 'blank';
  generatedAt: string;
}

/** Validation outcome for a cable or a proposed cable. */
export type IssueCode =
  | 'same_device'
  | 'port_missing'
  | 'occupied'
  | 'incompatible_port'
  | 'wrong_cable'
  | 'console_misuse'
  | 'trunk_endpoint'
  | 'speed_mismatch'
  | 'duplex_mismatch'
  | 'vlan_mismatch'
  | 'trunk_mismatch'
  | 'native_vlan_mismatch'
  | 'shutdown'
  | 'powered_off'
  | 'disabled'
  | 'mdix_corrected'
  | 'too_long'
  | 'stp_blocking'
  | 'channel_mismatch'
  | 'poe';

export interface CableIssue {
  code: IssueCode;
  /** error: the cable cannot be connected. down: connects, but no link. degraded: link with problems. info: fine, worth knowing. */
  severity: 'error' | 'down' | 'degraded' | 'info';
  message: string;
  fix?: string;
}

export type LinkState = 'up' | 'degraded' | 'down' | 'disabled';

export interface CableStatus {
  state: LinkState;
  issues: CableIssue[];
  /** Negotiated result, e.g. "1000 Mb/s full duplex" */
  negotiated?: string;
}
