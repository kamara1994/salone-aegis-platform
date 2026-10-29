# Lab designer: gap analysis against Packet Tracer, CML, GNS3 and EVE-NG

What the professional tools do that the AEGIS lab designer did not, and what we built about it.
Status: **Built** = in the designer now, with tests. **Partial** = the core works, some depth is missing.
**Roadmap** = not built yet; listed so nothing is forgotten.

Sources: Packet Tracer feature list and simulation help (packettracernetwork.com, tutorials.ptnetacad.net),
Cisco Modeling Labs docs (link conditioning, packet capture, release notes), EVE-NG feature list, GNS3 and
containerlab documentation, and day-to-day enterprise network engineering practice.

## 1. Switching (layer 2)

| Capability | Where it comes from | Status |
|---|---|---|
| VLANs, access and trunk ports, native VLAN, allowed VLANs | PT, CCNA | Built (first pass) |
| Spanning Tree: root bridge election, root/designated/alternate roles, blocked ports shown on the canvas, bridge priority | PT (STP/RSTP), CCNA/CCNP | Built |
| Broadcast storm detection when a loop exists with STP off | Real-world outage pattern | Built |
| EtherChannel (LACP active/passive, PAgP desirable/auto, static on) with member consistency checks | PT, CCNP | Built |
| MAC address table per switch (`show mac address-table`) | PT inspect tool | Built |
| CDP/LLDP neighbours (`show cdp neighbors`) | PT, real gear | Built |
| Port security (maximum, sticky learning, static MACs, shutdown/restrict/protect, err-disabled and recovery) | PT, CCNA | Built |
| BPDU guard (per port and `portfast bpduguard default`), root guard (root-inconsistent), PortFast | CCNA/CCNP | Built |
| Layer 3 switch: `ip routing`, SVIs, routed ports (`no switchport`) | CCNA | Built |
| `show interfaces trunk`, `show interfaces status err-disabled`, `show port-security` | PT CLI | Built |
| DHCP snooping (trusted ports, rogue server blocked, binding table) and Dynamic ARP Inspection | CCNA/CCNP security | Built |
| IP Source Guard, DHCP option 82 behaviour | CCNP security | Roadmap |
| DTP (dynamic auto/desirable, nonegotiate) and VTP (server/client/transparent, domain, password, revision sync, the VTP bomb) | PT, CCNA/CCNP | Built |
| Private VLANs, QinQ, VXLAN/EVPN | CCNP/CCIE DC | Roadmap |
| SPAN mirror sessions (`monitor session`) feeding the capture tool | CML (SPAN mode), real gear | Built (local SPAN; RSPAN on the roadmap) |

## 2. Routing (layer 3)

| Capability | Where it comes from | Status |
|---|---|---|
| Connected and static routes, default routes, longest-prefix match | PT, CCNA | Built (first pass) |
| OSPF: neighbours with real failure reasons (area, mask, hello/dead, MTU, passive, router-id), SPF costs from bandwidth, O / O IA / O*E2 routes, default-information originate | PT, CCNA/CCNP | Built |
| Administrative distance (connected 0, static 1, OSPF 110) | CCNA | Built |
| `show ip route` with codes, `show ip ospf neighbor` | PT CLI | Built |
| Traceroute with per-hop addresses and times | PT, real gear | Built |
| First-hop redundancy: HSRP (virtual IP, priority, preempt, active/standby, failover) | PT, CCNP | Built |
| NAT / PAT (inside/outside, overload on interface) and static NAT (publish a server), with translation table | PT, CCNA | Built |
| EIGRP: neighbours with failure reasons (AS, passive, subnet), composite metric, D routes AD 90, classful and wildcard network statements | PT, CCNP | Built |
| BGP (eBGP/iBGP, path attributes), route redistribution, route maps | PT, CCNP/CCIE | Roadmap |
| VRRP (master/backup, owner priority 255) and GLBP (hosts spread across forwarders) | CCNP | Built |
| Policy-based routing, VRF-lite, MPLS L3VPN | CCNP/CCIE SP | Roadmap |
| IPv6: SLAAC, DHCPv6, OSPFv3, dual stack | PT, CCNA | Roadmap |

## 3. Services and addressing

| Capability | Where it comes from | Status |
|---|---|---|
| DHCP server pools on servers/routers/firewalls, DHCP relay (`ip helper-address`), lease renew with exact failure reason | PT, CCNA | Built |
| ARP tables (`show arp`, `arp -a`) and ARP events in simulation | PT | Built |
| IPAM view: subnets, used addresses, duplicate detection | Enterprise practice | Partial (subnets in Structure, duplicate addresses in the Audit; no per-subnet usage view yet) |
| DNS, NTP, Syslog, SNMP, AAA/RADIUS/TACACS+ services | PT server services | Roadmap |
| HTTP/FTP/TFTP/Email server behaviour | PT server services | Roadmap (listening ports modelled) |

## 4. Security

| Capability | Where it comes from | Status |
|---|---|---|
| Stateful firewall rules, first match, implicit deny, shadowed-rule detection | OPNsense/ASA, CCNP security | Built |
| IOS ACLs: standard and extended, numbered and named, sequence numbers, in/out on interfaces, implicit deny, match counters, undefined-ACL behaviour | PT, CCNA | Built |
| Device hardening checks: Telnet vs SSH, enable secret, banner, unused ports shut, VLAN 1 use, native VLAN 1, missing port security, PortFast without BPDU guard, DTP on access ports, snooping with no trusted port, undefined ACLs | CIS benchmarks, real audits | Built (audit) |
| Design audit with severity and jump-to-device | Enterprise review practice | Built |
| IPsec / WireGuard tunnel parameters, IKE negotiation failures | PT (IPsec VPN), CCNP | Roadmap (tunnels modelled as links) |
| 802.1X / NAC | PT, CCNP | Roadmap |
| Zone-based firewall, IPS signatures | CCNP security | Roadmap |

## 5. Physical layer and power

| Capability | Where it comes from | Status |
|---|---|---|
| Cable types with auto-MDIX rules, speed/duplex negotiation | PT | Built (first pass) |
| Cable length limits: 100 m copper, multimode and single-mode fibre distances | PT physical view, TIA-568 | Built |
| Power over Ethernet: powered devices, PoE ports, switch power budget | Real gear (802.3af/at) | Built |
| Physical workspace: cities, buildings, wiring closets, rack elevation | PT physical view | Partial (sites, racks with U positions) |
| Module slots and transceivers (swap a NIM, insert an SFP) | PT, CML node definitions | Roadmap |

### Physical view additions

| Capability | Where it comes from | Status |
|---|---|---|
| Rear panel: power supplies (pull/insert, redundancy), fans, module slots | PT Physical tab, real hardware | Built |
| System LEDs (SYST/STAT/PoE…) and PoE budget meter with powered ports marked | Real switches, PT | Built |
| Audit warning when a device runs on fewer power supplies than it has | Real-world monitoring | Built |

## 6. Wireless

| Capability | Where it comes from | Status |
|---|---|---|
| Access point SSID, security (open/WPA2/WPA3), passphrase, channel | PT | Built |
| Client association with exact failure reason (SSID not found, wrong passphrase, security mismatch) | PT | Built |
| WLC with lightweight APs, roaming, RF coverage | PT 7.1+, CCNP wireless | Roadmap |

## 7. Simulation, capture and impairment

| Capability | Where it comes from | Status |
|---|---|---|
| Animated packets, event list, per-hop PDU details | PT simulation mode | Built (first pass) |
| OSI model view per hop (in layers / out layers) | PT PDU information window | Built |
| Event list filters by protocol and layer | PT event list filters | Built |
| ARP request/reply events before forwarding | PT | Built |
| Packet capture on a cable, download as a real `.pcap` for Wireshark | CML link capture, EVE-NG Wireshark | Built |
| Link conditioning: bandwidth, latency, jitter, loss | CML link conditioning, containerlab impairments | Built |
| Reachability matrix (any-to-any) | Network verification practice (Batfish-style) | Built |
| Complex PDUs, scheduled/periodic traffic, scenarios | PT | Partial (ping bursts, protocol/port choice) |
| Real IOS images (IOSv, CSR, NX-OSv) | CML, EVE-NG, GNS3 | Live back end only (Proxmox/CML adapters) |

## 8. CLI and device access

| Capability | Where it comes from | Status |
|---|---|---|
| IOS-style CLI on designed devices: modes, interface config, VLANs, OSPF, EIGRP, HSRP/VRRP/GLBP, NAT, EtherChannel, STP, port security, DHCP snooping, DAI, VTP, DTP, ACLs, SPAN, 30+ show commands, ping, traceroute | PT CLI | Built |
| Host command prompt: ipconfig, ipconfig /renew, ping, tracert, arp -a | PT desktop tab | Built |
| Consoles to real devices through the back end (SSH, serial, RDP, VNC via Guacamole) | CML, EVE-NG | Built (first pass) |
| Startup-config vs running-config, `write memory`, config archive | Real gear, CML day-0 configs | Built (running/startup in CLI) |

## 9. Lab management, collaboration and teaching

| Capability | Where it comes from | Status |
|---|---|---|
| Annotations: notes, labels, arrows (rotatable), rectangles, ellipses | PT notes/shapes, EVE-NG, CML annotations | Built |
| Search by name, IP, MAC, VLAN (`vlan 20`) or port (`SW1 Gi0/1`) | PT find, CML search | Built |
| Diagram export as SVG and PNG (devices, cables coloured by state, port labels, notes) | CML/EVE-NG export, Visio-style docs | Built |
| Custom canvas backgrounds (PNG/JPEG/WebP/GIF, 4 MB, resized to fit browser storage, overlay, remove) | EVE-NG/CML backgrounds | Built |
| Export/import the lab as JSON; inventory CSV and bill of materials | CML YAML export, EVE-NG export | Built |
| Goals ("A must reach B on 443", "users must not reach the DB") with Check results | PT Activity Wizard | Built |
| Troubleshooting challenges: inject a hidden fault, fix it, reveal the change | PT activities, real on-call | Built |
| Guided lab workbooks (17 CCNA/CCNP labs) that build their own topology and auto-grade every task from the live network | NetAcad PT activities, CCNA/CCNP lab guides | Built |
| Saved layouts, baseline compare, undo/redo | CML/EVE-NG | Built (first pass) |
| Node boot order/staging, lab timer | CML staging, EVE-NG lab timer | Roadmap |
| Multi-user editing with presence | EVE-NG Pro, PT multiuser | Roadmap |
| Automation: API, pyATS/Ansible export, MCP | CML | Roadmap |
| IoT programming, OT protocols (Modbus, Profinet) | PT 9 | Roadmap |

## 10. Learning, games and tracks

| Capability | Where it comes from | Status |
|---|---|---|
| Interactive lessons with Next/Back, progress, search, bookmarks, notes, beginner/advanced, watch/guided/independent modes | NetAcad course pages, interactive textbooks | Built |
| Quizzes, reveals, predictions, command trainer, "Open this in the Lab" | NetAcad activities | Built |
| Help-desk/NOC/SOC triage game with scoring, hints on request and lab links | Real service-desk practice | Built (16 roles, 21 cases) |
| Certification tracks with local progress and export | NetAcad, vendor learning paths | Built (AI exams need the back end) |
| Content packs (lessons, games, labs as validated JSON) | PT activity files, CML lab sharing | Built |
| Lesson/game authoring UI (forms instead of JSON) | PT Activity Wizard | Roadmap |
| DNS, HTTP and traceroute steps in packet simulation; PCAP export | PT simulation mode, CML capture | Partial (traceroute and capture exist; DNS/HTTP steps on the roadmap) |
| Device library search; smaller, toggleable mini map; library closed by default on small screens; staggered port labels on busy devices | Usability review | Built |
| Long-press context menu on iPhone/iPad (Safari does not fire contextmenu) | Touch usability | Roadmap |
