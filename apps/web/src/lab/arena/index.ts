// Lab Arena catalog: CCNA lab topics in book order. Topics marked 'soon' are listed so the
// student can see the whole path; their labs ship in later releases.
import { VLAN_LABS } from './labs-vlans';
import type { ArenaKind, ArenaLab, ArenaTopic } from './types';

export const ARENA_TOPICS: ArenaTopic[] = [
  { id: 'ch3-ios', chapter: 3, title: 'Cisco IOS basics', exam: ['4.1'], status: 'soon', blurb: 'Modes, passwords, saving config, local users.' },
  { id: 'ch4-switching', chapter: 4, title: 'Ethernet switching', exam: ['1.1', '2.4'], status: 'soon', blurb: 'MAC learning, interface faults, speed and duplex.' },
  { id: 'ch5-ipv4', chapter: 5, title: 'IPv4 addressing', exam: ['1.3', '1.6'], status: 'soon', blurb: 'Addresses, gateways, ARP and host settings.' },
  { id: 'ch6-routing', chapter: 6, title: 'Routing fundamentals', exam: ['3.1', '3.2'], status: 'soon', blurb: 'Routing tables, static, default and host routes.' },
  { id: 'ch7-subnetting', chapter: 7, title: 'Subnetting', exam: ['1.3'], status: 'soon', blurb: 'Design and troubleshoot subnets and VLSM plans.' },
  { id: 'ch8-vlans', chapter: 8, title: 'VLANs and trunking', exam: ['2.1', '2.2', '2.3', '2.4'], status: 'ready', blurb: 'VLANs, voice VLANs, 802.1Q trunks, native VLAN, DTP, router on a stick.' },
  { id: 'ch9-stp', chapter: 9, title: 'Spanning Tree, EtherChannel and edge ports', exam: ['2.1.c', '2.2', '2.5'], status: 'soon', blurb: 'Root election, guards, LACP and port channels to hosts.' },
  { id: 'ch10-ospf', chapter: 10, title: 'OSPF', exam: ['3.2.d', '3.3'], status: 'soon', blurb: 'Floating statics, OSPFv2 adjacencies, DR/BDR, router ID.' },
  { id: 'ch11-fhrp', chapter: 11, title: 'First hop redundancy', exam: ['3.4'], status: 'soon', blurb: 'HSRP and VRRP status and failover.' },
  { id: 'ch13-ipv6', chapter: 13, title: 'IPv6', exam: ['1.4', '3.2', '3.3'], status: 'soon', blurb: 'Addressing, static routes and OSPFv3.' },
  { id: 'ch14-acl', chapter: 14, title: 'Access control lists', exam: ['4.6'], status: 'soon', blurb: 'Standard, extended and named ACLs.' },
  { id: 'ch15-services', chapter: 15, title: 'DHCP, DNS and device services', exam: ['1.7', '4.2', '4.4'], status: 'soon', blurb: 'DHCP relay, DNS records, SCP and SFTP.' },
  { id: 'ch16-nat', chapter: 16, title: 'NAT and PAT', exam: ['4.3'], status: 'soon', blurb: 'Static NAT, pools and PAT on IOS XE.' },
  { id: 'ch17-security', chapter: 17, title: 'Layer 2 security and AAA', exam: ['4.1', '4.7'], status: 'soon', blurb: 'Port security, DHCP snooping, DAI, storm control, RA guard, AAA.' },
  { id: 'ch18-wireless', chapter: 18, title: 'Wireless', exam: ['1.5', '1.6'], status: 'soon', blurb: 'Channels, WLAN security and client troubleshooting.' },
  { id: 'ch21-final', chapter: 21, title: 'Final skills assessment', exam: ['all'], status: 'soon', blurb: 'One network, every topic, timed.' },
];

export const ARENA_LABS: ArenaLab[] = [...VLAN_LABS];
export const labsFor = (topicId: string) => ARENA_LABS.filter((l) => l.topicId === topicId);
export const arenaLab = (id: string) => ARENA_LABS.find((l) => l.id === id);
export const ARENA_PREFIX = 'arena:';
export const KIND_LABEL: Record<ArenaKind, string> = { guided: 'Guided', skills: 'Skills assessment', troubleshoot: 'Troubleshooting', challenge: 'Timed challenge' };
export const KIND_ORDER: ArenaKind[] = ['guided', 'skills', 'troubleshoot', 'challenge'];
export type { ArenaLab, ArenaTopic } from './types';
