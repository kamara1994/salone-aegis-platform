// Device catalog: real-world models with their actual port layouts. Every device placed on the
// canvas is created from one of these, so its ports, speeds and cabling rules are realistic.
import { macFor } from './net';
import type { Device, DeviceKind, Iface, PortType, Speed } from './types';

export interface PortTemplate {
  name: string;
  type: PortType;
  speeds: Exclude<Speed, 'auto'>[];
  /** Fixed speed/duplex (no autonegotiation), e.g. legacy NICs or optics */
  fixed?: { speed: Exclude<Speed, 'auto'>; duplex: 'full' | 'half' };
}

export interface DeviceModel {
  key: string;
  kind: DeviceKind;
  vendor: string;
  name: string;
  description: string;
  image: string; // under /public
  /** Auto-MDIX lets a copper port fix straight/crossover mistakes on its own. */
  autoMdix: boolean;
  /** l2 = switches frames by VLAN; l3 = routes between subnets; host = endpoint */
  forwarding: 'l2' | 'l3' | 'host';
  macPrefix: string;
  consoles: Device['consoles'];
  listening: number[];
  ports: () => PortTemplate[];
}

const range = (n: number, f: (i: number) => PortTemplate) => Array.from({ length: n }, (_, i) => f(i + 1));
const COPPER_G: Exclude<Speed, 'auto'>[] = [10, 100, 1000];

export const CATALOG: DeviceModel[] = [
  {
    key: 'isr4331',
    kind: 'router',
    vendor: 'Cisco',
    name: 'ISR 4331',
    description: '3 x GE (2 copper, 1 SFP), NIM-2T serial, console',
    image: '/lab/devices/router.svg',
    autoMdix: true,
    forwarding: 'l3',
    macPrefix: '00:a3:8e',
    consoles: ['ssh', 'serial'],
    listening: [22],
    ports: () => [
      { name: 'Gi0/0/0', type: 'copper', speeds: COPPER_G },
      { name: 'Gi0/0/1', type: 'copper', speeds: COPPER_G },
      { name: 'Gi0/0/2', type: 'sfp', speeds: [1000] },
      { name: 'Se0/1/0', type: 'serial', speeds: [10] },
      { name: 'Se0/1/1', type: 'serial', speeds: [10] },
      { name: 'Console', type: 'console', speeds: [10] },
    ],
  },
  {
    key: 'isr1941',
    kind: 'router',
    vendor: 'Cisco',
    name: '1941 (legacy)',
    description: '2 x GE copper without auto-MDIX on this IOS, 2 x serial, console',
    image: '/lab/devices/router.svg',
    autoMdix: false,
    forwarding: 'l3',
    macPrefix: '00:1e:7a',
    consoles: ['ssh', 'serial'],
    listening: [22, 23],
    ports: () => [
      { name: 'Gi0/0', type: 'copper', speeds: COPPER_G },
      { name: 'Gi0/1', type: 'copper', speeds: COPPER_G },
      { name: 'Se0/0/0', type: 'serial', speeds: [10] },
      { name: 'Se0/0/1', type: 'serial', speeds: [10] },
      { name: 'Console', type: 'console', speeds: [10] },
    ],
  },
  {
    key: 'c2960x24',
    kind: 'switch',
    vendor: 'Cisco',
    name: 'Catalyst 2960-X 24TS',
    description: '24 x GE copper, 4 x SFP uplinks, console',
    image: '/lab/devices/switch.svg',
    autoMdix: true,
    forwarding: 'l2',
    macPrefix: '00:2a:10',
    consoles: ['ssh', 'serial'],
    listening: [22],
    ports: () => [...range(24, (i) => ({ name: `Gi0/${i}`, type: 'copper', speeds: COPPER_G })), ...range(4, (i) => ({ name: `Gi0/${24 + i}`, type: 'sfp', speeds: [1000] })), { name: 'Console', type: 'console', speeds: [10] }],
  },
  {
    key: 'c9300-24t',
    kind: 'switch',
    vendor: 'Cisco',
    name: 'Catalyst 9300 24T',
    description: '24 x GE copper, 4 x 10G SFP+, console',
    image: '/lab/devices/switch.svg',
    autoMdix: true,
    forwarding: 'l2',
    macPrefix: '00:5f:86',
    consoles: ['ssh', 'serial'],
    listening: [22],
    ports: () => [...range(24, (i) => ({ name: `Gi1/0/${i}`, type: 'copper', speeds: COPPER_G })), ...range(4, (i) => ({ name: `Te1/1/${i}`, type: 'sfp', speeds: [10000] })), { name: 'Console', type: 'console', speeds: [10] }],
  },
  {
    key: 'dec2750',
    kind: 'firewall',
    vendor: 'Deciso',
    name: 'OPNsense DEC2750',
    description: '4 x GE copper, 2 x 10G SFP+, console',
    image: '/lab/devices/firewall.svg',
    autoMdix: true,
    forwarding: 'l3',
    macPrefix: '00:0d:b9',
    consoles: ['ssh', 'serial'],
    listening: [22, 443],
    ports: () => [...range(4, (i) => ({ name: `igb${i - 1}`, type: 'copper', speeds: COPPER_G })), { name: 'ix0', type: 'sfp', speeds: [10000] }, { name: 'ix1', type: 'sfp', speeds: [10000] }, { name: 'wg0', type: 'virtual', speeds: [1000] }, { name: 'wg1', type: 'virtual', speeds: [1000] }, { name: 'Console', type: 'console', speeds: [10] }],
  },
  {
    key: 'r650',
    kind: 'server',
    vendor: 'Dell',
    name: 'PowerEdge R650',
    description: '2 x GE copper, 2 x 10G SFP+, iDRAC',
    image: '/lab/devices/server.svg',
    autoMdix: true,
    forwarding: 'host',
    macPrefix: 'b0:7b:25',
    consoles: ['ssh', 'rdp'],
    listening: [22],
    ports: () => [
      { name: 'eno1', type: 'copper', speeds: COPPER_G },
      { name: 'eno2', type: 'copper', speeds: COPPER_G },
      { name: 'ens3f0', type: 'sfp', speeds: [10000] },
      { name: 'ens3f1', type: 'sfp', speeds: [10000] },
    ],
  },
  {
    key: 'proxmox-vm',
    kind: 'vm',
    vendor: 'Proxmox VE',
    name: 'Virtual machine (virtio)',
    description: 'virtio NICs bridged to the lab network, console through the hypervisor',
    image: '/lab/devices/vm.svg',
    autoMdix: true,
    forwarding: 'host',
    macPrefix: 'bc:24:11',
    consoles: ['ssh', 'rdp', 'vnc'],
    listening: [22],
    ports: () => [
      { name: 'net0', type: 'virtual', speeds: [1000, 10000] },
      { name: 'net1', type: 'virtual', speeds: [1000, 10000] },
    ],
  },
  {
    key: 'optiplex',
    kind: 'pc',
    vendor: 'Dell',
    name: 'OptiPlex 7010',
    description: 'GE copper NIC, RS-232 port for console cables',
    image: '/lab/devices/pc.svg',
    autoMdix: true,
    forwarding: 'host',
    macPrefix: 'd0:94:66',
    consoles: ['rdp', 'vnc'],
    listening: [3389],
    ports: () => [
      { name: 'Ethernet', type: 'copper', speeds: COPPER_G },
      { name: 'RS232', type: 'terminal', speeds: [10] },
    ],
  },
  {
    key: 'legacy-pc',
    kind: 'pc',
    vendor: 'Generic',
    name: 'Legacy PC (100 Mb NIC)',
    description: 'Fast Ethernet NIC fixed at 100/full, no auto-MDIX',
    image: '/lab/devices/pc.svg',
    autoMdix: false,
    forwarding: 'host',
    macPrefix: '00:0c:29',
    consoles: ['vnc'],
    listening: [],
    ports: () => [
      { name: 'FastEthernet0', type: 'copper', speeds: [10, 100], fixed: { speed: 100, duplex: 'full' } },
      { name: 'RS232', type: 'terminal', speeds: [10] },
    ],
  },
  {
    key: 'thinkpad',
    kind: 'laptop',
    vendor: 'Lenovo',
    name: 'ThinkPad T14',
    description: 'GE copper, Wi-Fi 6, USB console adapter',
    image: '/lab/devices/laptop.svg',
    autoMdix: true,
    forwarding: 'host',
    macPrefix: '8c:8d:28',
    consoles: ['rdp', 'vnc'],
    listening: [],
    ports: () => [
      { name: 'Ethernet', type: 'copper', speeds: COPPER_G },
      { name: 'Wi-Fi', type: 'wireless', speeds: [1000] },
      { name: 'USB-Console', type: 'terminal', speeds: [10] },
    ],
  },
  {
    key: 'c9120',
    kind: 'ap',
    vendor: 'Cisco',
    name: 'Catalyst 9120AXI',
    description: 'GE copper uplink (PoE), Wi-Fi 6 radio',
    image: '/lab/devices/ap.svg',
    autoMdix: true,
    forwarding: 'l2',
    macPrefix: '68:7d:b4',
    consoles: ['ssh'],
    listening: [22],
    ports: () => [
      { name: 'Gi0', type: 'copper', speeds: COPPER_G },
      { name: 'radio0', type: 'wireless', speeds: [1000] },
    ],
  },
  {
    key: 'aws-vpc',
    kind: 'cloud',
    vendor: 'AWS',
    name: 'VPC / cloud service',
    description: 'Attachments for VPN, Direct Connect and service endpoints',
    image: '/lab/devices/cloud.svg',
    autoMdix: true,
    forwarding: 'l3',
    macPrefix: '0a:00:27',
    consoles: [],
    listening: [443],
    ports: () => [...range(4, (i) => ({ name: `attach${i}`, type: 'virtual', speeds: [1000, 10000] })), { name: 'wan0', type: 'copper', speeds: COPPER_G }],
  },
  {
    key: 'internet',
    kind: 'cloud',
    vendor: 'ISP',
    name: 'Internet / WAN provider',
    description: 'Provider edge with copper, fibre and serial hand-offs',
    image: '/lab/devices/cloud.svg',
    autoMdix: true,
    forwarding: 'l3',
    macPrefix: '00:00:5e',
    consoles: [],
    listening: [53, 80, 443],
    ports: () => [
      { name: 'pe0', type: 'copper', speeds: COPPER_G },
      { name: 'pe1', type: 'copper', speeds: COPPER_G },
      { name: 'pe2', type: 'sfp', speeds: [1000, 10000] },
      { name: 'pe3', type: 'serial', speeds: [10] },
      { name: 'tun0', type: 'virtual', speeds: [1000] },
    ],
  },
  {
    key: 'axis-cam',
    kind: 'iot',
    vendor: 'Axis',
    name: 'M3106 IP camera',
    description: 'Fast Ethernet PoE, fixed 100/full, no auto-MDIX',
    image: '/lab/devices/iot.svg',
    autoMdix: false,
    forwarding: 'host',
    macPrefix: 'ac:cc:8e',
    consoles: [],
    listening: [80, 554],
    ports: () => [{ name: 'eth0', type: 'copper', speeds: [10, 100], fixed: { speed: 100, duplex: 'full' } }],
  },
  {
    key: 'iot-sensor',
    kind: 'iot',
    vendor: 'Generic',
    name: 'Environmental sensor',
    description: '10/100 copper, half duplex',
    image: '/lab/devices/iot.svg',
    autoMdix: false,
    forwarding: 'host',
    macPrefix: '24:0a:c4',
    consoles: [],
    listening: [1883],
    ports: () => [{ name: 'eth0', type: 'copper', speeds: [10, 100], fixed: { speed: 100, duplex: 'half' } }],
  },
];

export const MODEL_BY_KEY: Record<string, DeviceModel> = Object.fromEntries(CATALOG.map((m) => [m.key, m]));

export const DEFAULT_MODEL: Record<DeviceKind, string> = {
  router: 'isr4331',
  switch: 'c2960x24',
  firewall: 'dec2750',
  server: 'r650',
  pc: 'optiplex',
  laptop: 'thinkpad',
  ap: 'c9120',
  cloud: 'aws-vpc',
  vm: 'proxmox-vm',
  iot: 'axis-cam',
};

export const KIND_LABEL: Record<DeviceKind, string> = {
  router: 'Router',
  switch: 'Switch',
  firewall: 'Firewall',
  server: 'Server',
  pc: 'PC',
  laptop: 'Laptop',
  ap: 'Access point',
  cloud: 'Cloud',
  vm: 'Virtual machine',
  iot: 'IoT device',
};

export function modelOf(d: Pick<Device, 'model' | 'kind'>): DeviceModel {
  return MODEL_BY_KEY[d.model] ?? MODEL_BY_KEY[DEFAULT_MODEL[d.kind]];
}

export function ifaceFromTemplate(t: PortTemplate, seed: string, prefix: string): Iface {
  return {
    name: t.name,
    type: t.type,
    speeds: t.speeds,
    speed: t.fixed?.speed ?? 'auto',
    duplex: t.fixed?.duplex ?? (t.type === 'serial' || t.type === 'console' || t.type === 'terminal' ? 'full' : 'auto'),
    mac: t.type === 'console' || t.type === 'terminal' ? '' : macFor(`${seed}/${t.name}`, prefix),
    shutdown: false,
  };
}

export function isFixed(model: DeviceModel, port: string): PortTemplate['fixed'] {
  return model.ports().find((p) => p.name === port)?.fixed;
}
