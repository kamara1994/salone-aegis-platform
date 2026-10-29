import type { Lesson } from '../types';

export const vlanLesson: Lesson = {
  id: 'vlans',
  title: 'VLANs from zero to troubleshooting',
  summary: 'What VLANs are, access and trunk ports, 802.1Q tagging, the native VLAN, inter-VLAN routing, configuration on Cisco, OPNsense and Linux, and how to fix them when they break.',
  tracks: ['ccna', 'helpdesk'],
  minutes: 45,
  difficulty: 1,
  tags: ['vlan', 'trunk', '802.1q', 'switching'],
  lab: { workbook: 'vlans-trunking' },
  sections: [
    {
      id: 'what',
      title: 'What is a VLAN?',
      blocks: [
        { type: 'p', text: 'A **VLAN** (virtual LAN) splits one physical switch into several separate layer 2 networks. Devices in the same VLAN behave as if they were on their own switch; devices in different VLANs cannot talk to each other without a router.' },
        { type: 'diagram', name: 'vlan-split', caption: 'One 24-port switch, three VLANs: each colour is its own broadcast domain.' },
        { type: 'p', text: 'Each VLAN is one **broadcast domain**. A broadcast (ARP request, DHCP discover) sent in VLAN 10 reaches every port in VLAN 10 and nothing else.' },
        { type: 'predict', question: 'PC-A (VLAN 10) sends an ARP broadcast. Which ports receive it?', options: ['Every port on the switch', 'Only ports in VLAN 10 (and trunks carrying VLAN 10)', 'Only the router port'], answer: 1, explain: 'A switch floods broadcasts only within the VLAN the frame belongs to, including trunks that carry that VLAN.' },
        { type: 'reveal', prompt: 'Is a VLAN the same thing as a subnet?', answer: 'Not by definition, but in practice they map **one to one**: VLAN 10 = 10.10.10.0/24, VLAN 20 = 10.10.20.0/24. The VLAN is layer 2 (who gets the frame); the subnet is layer 3 (who is local for IP).' },
      ],
    },
    {
      id: 'why',
      title: 'Why VLANs are used',
      blocks: [
        { type: 'list', items: ['**Security**: guests, cameras and finance do not share a network; traffic between them must pass a router or firewall where it can be filtered.', '**Smaller broadcast domains**: fewer devices hear each broadcast, so less noise and faster ARP and DHCP.', '**Flexibility**: a user moves desks and keeps their VLAN by changing one port, not re-cabling.', '**Quality of service**: voice phones go in a voice VLAN that can be prioritised.'] },
        { type: 'table', head: ['VLAN', 'Name', 'Who', 'Subnet'], rows: [['10', 'USERS', 'Staff PCs and laptops', '10.10.10.0/24'], ['20', 'VOICE', 'IP phones', '10.10.20.0/24'], ['30', 'SERVERS', 'Servers', '10.10.30.0/24'], ['80', 'GUEST', 'Guest Wi-Fi', '10.10.80.0/24'], ['99', 'NATIVE', 'Unused native VLAN for trunks', 'none']], caption: 'A typical small-office VLAN plan.' },
        { type: 'callout', tone: 'tip', title: 'Real world', text: 'Never leave users in **VLAN 1**. It is the default VLAN on every port and carries control traffic; attackers love it.' },
      ],
    },
    {
      id: 'access',
      title: 'Access ports',
      blocks: [
        { type: 'p', text: 'An **access port** belongs to exactly one VLAN and carries untagged frames. PCs, printers and cameras connect to access ports and have no idea VLANs exist.' },
        { type: 'device', model: 'c2960x24', caption: 'A Catalyst 2960-X: ports **Gi0/1-24** are copper access ports, **Gi0/25-28** are SFP uplinks.', points: ['Gi0/1-24: user ports (access)', 'Gi0/25-28: SFP uplinks (trunks)', 'Console: out-of-band management'] },
        { type: 'code', title: 'Cisco IOS: put Gi0/5 in VLAN 10', lang: 'ios', code: 'interface GigabitEthernet0/5\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast' },
        { type: 'cmd', prompt: 'SW1#', command: 'show vlan brief', output: 'VLAN Name         Status    Ports\n---- ------------ --------- ----------------------\n1    default      active    Gi0/2, Gi0/3, Gi0/4\n10   USERS        active    Gi0/1, Gi0/5\n20   VOICE        active    Gi0/6', explain: 'Access ports are listed under their VLAN. **Trunk ports never appear here.**' },
      ],
    },
    {
      id: 'trunk',
      title: 'Trunk ports',
      blocks: [
        { type: 'p', text: 'A **trunk** carries many VLANs over one link, usually between switches or from a switch to a router or firewall. Frames are **tagged** so the far side knows which VLAN each belongs to.' },
        { type: 'diagram', name: 'access-trunk', caption: 'Access ports to the PCs, one trunk between the switches carrying VLAN 10 and 20.' },
        { type: 'code', title: 'Cisco IOS trunk', lang: 'ios', code: 'interface GigabitEthernet0/24\n switchport mode trunk\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20,99\n switchport nonegotiate' },
        { type: 'cmd', prompt: 'SW1#', command: 'show interfaces trunk', output: 'Port    Mode   Encapsulation  Status    Native vlan\nGi0/24  on     802.1q         trunking  99\n\nPort    Vlans allowed on trunk\nGi0/24  10,20,99', explain: 'Always check **Status trunking**, the **native VLAN** on both ends, and the **allowed list**.' },
      ],
    },
    {
      id: 'tagging',
      title: 'VLAN tagging (802.1Q)',
      blocks: [
        { type: 'p', text: '802.1Q inserts a 4-byte tag after the source MAC address. The tag holds a 12-bit **VLAN ID** (1-4094) and a 3-bit **priority** (CoS) used for QoS.' },
        { type: 'diagram', name: 'dot1q', caption: 'An Ethernet frame with the 802.1Q tag inserted. Type 0x8100 means "a tag follows".' },
        { type: 'reveal', prompt: 'Why can a VLAN ID only go up to 4094?', answer: '12 bits give 4096 values; 0 and 4095 are reserved, which leaves **1-4094**.' },
        { type: 'p', level: 'advanced', text: 'Q-in-Q (802.1ad) stacks a second tag so a provider can carry customer VLANs inside its own. The capture tool in the Lab shows the 802.1Q tag in the Ethernet layer of every tagged frame.' },
      ],
    },
    {
      id: 'native',
      title: 'Native VLAN',
      blocks: [
        { type: 'p', text: 'On a trunk, one VLAN is sent **untagged**: the native VLAN (VLAN 1 by default). Both ends must agree, or traffic leaks between VLANs.' },
        { type: 'callout', tone: 'warn', title: 'Native VLAN mismatch', text: 'If SW1 uses native VLAN 1 and SW2 uses 99, untagged frames from VLAN 1 land in VLAN 99 on the other side. CDP logs **%CDP-4-NATIVE_VLAN_MISMATCH** and the Lab marks the cable amber.' },
        { type: 'predict', question: 'Best practice for the native VLAN?', options: ['Leave it as VLAN 1', 'Use a dedicated unused VLAN (e.g. 99) on both ends', 'Use the users VLAN'], answer: 1, explain: 'An unused native VLAN, identical on both ends, prevents VLAN-hopping attacks that abuse untagged frames.' },
      ],
    },
    {
      id: 'routing',
      title: 'Inter-VLAN routing',
      blocks: [
        { type: 'p', text: 'Hosts in different VLANs need a **layer 3 device** to talk: a router with sub-interfaces ("router-on-a-stick"), a layer 3 switch with SVIs, or a firewall with VLAN interfaces.' },
        { type: 'diagram', name: 'roas', caption: 'Router-on-a-stick: one physical link, one sub-interface per VLAN, each with the gateway address of its VLAN.' },
        { type: 'compare', before: { title: 'Router-on-a-stick', code: 'interface Gi0/0/0.10\n encapsulation dot1Q 10\n ip address 10.10.10.1 255.255.255.0' }, after: { title: 'Layer 3 switch (SVI)', code: 'ip routing\ninterface Vlan10\n ip address 10.10.10.1 255.255.255.0\n no shutdown' } },
        { type: 'callout', tone: 'info', text: 'A layer 3 switch only routes after **ip routing**. The Lab drops the packet and says so when you forget.' },
      ],
    },
    {
      id: 'cisco',
      title: 'Cisco configuration, step by step',
      blocks: [
        { type: 'trainer', id: 'vlan-cisco', title: 'Build VLAN 10 and a trunk on SW1', device: 'SW1 (Catalyst 2960-X)', steps: [
          { goal: 'Enter global configuration mode.', expect: '^(conf(igure)?( t(erminal)?)?)$', output: 'Enter configuration commands, one per line.  End with CNTL/Z.\nSW1(config)#', hint: 'configure terminal (or conf t)' },
          { goal: 'Create VLAN 10.', expect: '^vlan 10$', output: 'SW1(config-vlan)#', hint: 'vlan 10' },
          { goal: 'Name it USERS.', expect: '^name users$', output: 'SW1(config-vlan)#', hint: 'name USERS' },
          { goal: 'Go to interface Gi0/5.', expect: '^(int(erface)?) ?(g(i(gabitethernet)?)?) ?0/5$', output: 'SW1(config-if)#', hint: 'interface g0/5' },
          { goal: 'Make it an access port in VLAN 10 (mode first).', expect: '^switchport mode access$', output: 'SW1(config-if)#', hint: 'switchport mode access' },
          { goal: 'Assign VLAN 10.', expect: '^switchport access vlan 10$', output: 'SW1(config-if)#', hint: 'switchport access vlan 10' },
        ] },
        { type: 'callout', tone: 'tip', text: 'This trainer only checks your commands. To run them on a simulated switch with real results, use **Open in the Lab**.' },
      ],
    },
    {
      id: 'opnsense',
      title: 'OPNsense configuration',
      blocks: [
        { type: 'list', ordered: true, items: ['**Interfaces → Other Types → VLAN**: add VLAN 10 on parent igb1, tag 10, description USERS.', '**Interfaces → Assignments**: assign the new vlan0.10 device, enable it, name it USERS.', 'Set a static IPv4 address **10.10.10.1/24** (the gateway for VLAN 10).', '**Services → DHCPv4 → USERS**: enable a range, e.g. 10.10.10.100-200.', '**Firewall → Rules → USERS**: add pass rules; by default a new interface blocks everything.'] },
        { type: 'callout', tone: 'warn', text: 'The switch port facing OPNsense must be a **trunk** allowing VLAN 10, or the firewall never sees tagged frames.' },
      ],
    },
    {
      id: 'linux',
      title: 'Linux configuration',
      blocks: [
        { type: 'cmd', prompt: '$', command: 'sudo ip link add link eno1 name eno1.10 type vlan id 10 && sudo ip addr add 10.10.10.5/24 dev eno1.10 && sudo ip link set eno1.10 up', explain: 'Creates a tagged sub-interface on eno1 (needs the 8021q module).' },
        { type: 'code', title: 'Persistent with netplan', lang: 'yaml', code: 'network:\n  version: 2\n  ethernets:\n    eno1: {}\n  vlans:\n    eno1.10:\n      id: 10\n      link: eno1\n      addresses: [10.10.10.5/24]' },
      ],
    },
    {
      id: 'failures',
      title: 'Common VLAN failures',
      blocks: [
        { type: 'table', head: ['Symptom', 'Likely cause', 'Check'], rows: [['PC gets 169.254.x.x', 'Port in the wrong VLAN (no DHCP there)', '`show vlan brief`, `show interfaces status`'], ['Same VLAN on two switches cannot talk', 'VLAN missing from the trunk allowed list, or VLAN not created on one switch', '`show interfaces trunk`, `show vlan brief` on both'], ['Port inactive', 'Access VLAN does not exist in the VLAN database', '`show interfaces g0/x switchport`'], ['Random leaks between VLANs', 'Native VLAN mismatch', '`show interfaces trunk` both ends, CDP logs'], ['Different VLANs cannot talk', 'No router / no ip routing / wrong gateway', '`show ip route`, PC default gateway']] },
        { type: 'quiz', id: 'vlan-failures', questions: [
          { q: 'A user moved desks and now gets 169.254.10.7. What do you check first?', options: ['The DNS server', 'The access VLAN of their new switch port', 'The firewall rules'], answer: 1, explain: 'APIPA means DHCP got no answer; a port in the wrong VLAN is the most common cause after a move.' },
          { q: 'Two switches, both have VLAN 20, hosts in VLAN 20 cannot reach each other across the trunk. Most likely?', options: ['VLAN 20 is not in the trunk allowed list', 'The hosts need a router', 'STP is disabled'], answer: 0, explain: 'Same VLAN means no routing is needed; the trunk must carry the VLAN.' },
        ] },
      ],
    },
    {
      id: 'visual',
      title: 'Visual examples',
      blocks: [
        { type: 'diagram', name: 'mac-table', caption: 'How a switch learns: source MAC + incoming port + VLAN go into the MAC address table.' },
        { type: 'device', model: 'c9300-24t', caption: 'Catalyst 9300: copper **Gi1/0/1-24** and **Te1/1/1-4** 10G uplinks; supports ip routing for SVIs.' },
      ],
    },
    {
      id: 'quiz',
      title: 'Practice quiz',
      blocks: [
        { type: 'quiz', id: 'vlan-final', questions: [
          { q: 'Which statement about access ports is true?', options: ['They carry many VLANs', 'They carry one VLAN, untagged', 'They always tag frames'], answer: 1, explain: 'Access ports belong to one VLAN and send untagged frames to the end device.' },
          { q: 'How many bytes does an 802.1Q tag add?', options: ['2', '4', '8'], answer: 1, explain: 'TPID (2 bytes, 0x8100) + TCI (2 bytes: PCP, DEI, VLAN ID).' },
          { q: 'Which command shows trunk status and allowed VLANs?', options: ['show vlan brief', 'show interfaces trunk', 'show ip interface brief'], answer: 1, explain: 'show interfaces trunk lists mode, status, native VLAN and allowed/active VLANs.' },
          { q: 'What must both ends of a trunk agree on?', options: ['Hostname', 'Native VLAN', 'IP address'], answer: 1, explain: 'A native VLAN mismatch leaks untagged traffic between VLANs.' },
        ] },
      ],
    },
    {
      id: 'configure',
      title: 'Configure a VLAN in the Lab',
      blocks: [
        { type: 'p', text: 'Build VLANs 10 and 20 on two switches, set access ports and a trunk with native VLAN 99. The Lab grades each task from the live network.' },
        { type: 'lab', text: 'Open the VLANs and trunking lab', workbook: 'vlans-trunking' },
      ],
    },
    {
      id: 'troubleshoot',
      title: 'Troubleshoot a broken VLAN',
      blocks: [
        { type: 'p', text: 'A hidden fault puts a workstation in the wrong VLAN. Use `show vlan brief`, the Physical tab and packet simulation to find it.' },
        { type: 'lab', text: 'Start the "wrong VLAN" troubleshooting drill', challenge: 'wrong-vlan' },
      ],
    },
    {
      id: 'final',
      title: 'Final graded exercise',
      blocks: [
        { type: 'p', text: 'Route between VLANs with router-on-a-stick and prove PC1 reaches PC2. Every task is checked automatically.' },
        { type: 'lab', text: 'Open the router-on-a-stick lab', workbook: 'router-on-a-stick', graded: true },
      ],
    },
  ],
};
