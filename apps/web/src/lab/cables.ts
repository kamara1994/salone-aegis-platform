// What each cable type is for, as shown in the Cables tab of the library (Packet Tracer's "Connections").
import type { CableType } from './types';

export interface CableInfo {
  type: CableType | 'auto';
  name: string;
  connector: string;
  use: string;
  limit: string;
}

export const CABLE_INFO: CableInfo[] = [
  { type: 'auto', name: 'Automatic', connector: 'Picks for you', use: 'Chooses the right cable for the two ports you pick (copper, fibre, console, serial or virtual).', limit: 'Follows the rules of the cable it picks' },
  { type: 'straight', name: 'Copper straight-through', connector: 'RJ-45, T568B both ends', use: 'Different device types: PC, server, router or AP to a switch.', limit: '100 m (Cat5e/Cat6)' },
  { type: 'crossover', name: 'Copper crossover', connector: 'RJ-45, T568A one end, T568B the other', use: 'Like devices without auto-MDIX: switch to switch, PC to PC, router to router.', limit: '100 m' },
  { type: 'trunk', name: 'Trunk (802.1Q)', connector: 'RJ-45 or fibre, tagged', use: 'Switch to switch or switch to router-on-a-stick; carries many VLANs. Sets both ports to trunk.', limit: 'Same as the medium' },
  { type: 'access', name: 'Access', connector: 'RJ-45, untagged', use: 'Host port in one VLAN. Sets the switch port to access mode.', limit: '100 m' },
  { type: 'fiber', name: 'Fibre', connector: 'LC duplex into SFP/SFP+', use: 'Uplinks between switches, routers and firewalls; long runs between closets or buildings.', limit: 'Multimode 300–550 m, single-mode 10 km+' },
  { type: 'console', name: 'Console (rollover)', connector: 'RJ-45 or USB to DB-9/USB', use: 'From a PC terminal port to a router or switch console for out-of-band setup.', limit: '15 m' },
  { type: 'serial', name: 'Serial DCE/DTE', connector: 'Smart serial / V.35', use: 'Legacy WAN between routers; the DCE end provides the clock.', limit: '15 m' },
  { type: 'wan', name: 'WAN circuit', connector: 'Provider hand-off', use: 'Internet or carrier link to an ISP cloud; set provider, bandwidth and latency.', limit: 'Set by the provider' },
  { type: 'virtual', name: 'Virtual / wireless', connector: 'vNIC, tunnel, radio', use: 'VM networks, VPN tunnels, cloud attachments and Wi-Fi association.', limit: 'None' },
];
