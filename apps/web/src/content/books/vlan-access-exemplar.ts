/** Authored reference lesson for CCNA v1.1 objective 2.1.a/b. */
const authoredLesson = {
  why: 'A switchport placed in the wrong VLAN can give a working PC the wrong neighbors, DHCP scope, and gateway. The link light can be green while the user still cannot reach the intended service.',
  beginner: {
    definition: 'A VLAN separates one physical switch into smaller local networks. An access port places a connected device into one of those networks.',
    analogy: 'Imagine one building with two offices. Staff use the blue office; guests use the orange office. Each Ethernet port is a door assigned to one office. A computer plugged into a guest door stays with guests even if you rename the computer “staff.”',
    analogyParts: [
      { analogy: 'Building', meaning: 'One physical switch' },
      { analogy: 'Office', meaning: 'One VLAN, with its own Layer 2 broadcast domain' },
      { analogy: 'Door', meaning: 'An access port assigned to that VLAN' },
      { analogy: 'Hallway between offices', meaning: 'A router or Layer 3 switch needed for traffic between VLANs' },
    ],
    example: 'A staff PC is connected to Gi0/2. Give that port VLAN 20. A guest PC on VLAN 30 remains in a separate local network until a router explicitly permits communication.',
    remember: 'The switchport decides the access VLAN. Changing only the PC’s IP address does not move the port.',
  },
  technical: {
    definition: 'An access port classifies ordinary untagged ingress Ethernet frames into its configured access VLAN and sends ordinary endpoint traffic untagged on that link.',
    explanation: 'VLANs divide Layer 2 broadcast domains. A VLAN ID is local to the switched topology, while an IPv4 subnet is a Layer 3 addressing choice. They are commonly mapped one-to-one, but creating a VLAN does not create an IP subnet, DHCP scope, SVI, or route.',
    application: 'On an isolated Cisco IOS/IOS XE switch, create VLAN 20, assign Gi0/2 as an access port, then inspect VLAN membership and the interface operational state.',
    deepDive: 'VLAN 1 is the usual default access VLAN on a factory-default Cisco switch. Administrators should verify the actual configuration instead of assuming a port is still at its default. A voice VLAN can add tagged phone traffic on an access-facing port; that is a separate design case.',
    remember: 'Check both VLAN membership and interface state. A correct access VLAN on a shut or disconnected port cannot carry traffic.',
    check: 'Which output proves Gi0/2 is assigned to VLAN 20, and which output proves the link is operational?',
  },
  wordHelp: [
    { term: 'Access port', meaning: 'A switch interface that assigns ordinary endpoint traffic to one data VLAN.' },
    { term: 'Broadcast domain', meaning: 'The set of Layer 2 interfaces that can receive one Ethernet broadcast.' },
    { term: 'SVI', meaning: 'A switch virtual interface that can give a VLAN a Layer 3 interface on a capable switch.' },
    { term: 'Untagged', meaning: 'An Ethernet frame without an 802.1Q VLAN header on this link.' },
  ],
  teaching: {
    problem: 'SW1 Gi0/2 connects to STAFF-PC. The design requires STAFF-PC in VLAN 20, named STAFF. VLAN 30 is reserved for guests. The PC has a good cable but receives an address from the guest scope.',
    steps: [
      { number: 1, text: 'Identify the actual switch interface connected to STAFF-PC. Check the port description or the physical connection; do not assume Gi0/2 from a diagram alone.' },
      { number: 2, text: 'Check the current state with show interfaces Gi0/2 switchport and show vlan brief. If Access Mode VLAN says 30, the port is in the guest VLAN.' },
      { number: 3, text: 'Create VLAN 20 named STAFF, then set Gi0/2 to access mode and assign access VLAN 20. Change only the intended lab port.' },
      { number: 4, text: 'Run show vlan brief and show interfaces Gi0/2 switchport again. Confirm VLAN 20 lists Gi0/2 and Access Mode VLAN is 20.' },
      { number: 5, text: 'Renew the PC address if DHCP is used. Confirm the PC receives the staff subnet and can reach an intended staff host or gateway. A route or Layer 3 switch is needed to reach another VLAN.' },
    ],
    result: 'After the port moves to VLAN 20, STAFF-PC joins the staff broadcast domain. Its old guest DHCP lease may persist until renewed; VLAN membership and IP settings must both be checked.',
    method: 'Compare the expected VLAN with the port’s operational access VLAN, interface state, DHCP address, and reachability. Investigate a trunk only if the destination is across another switch.',
    verify: 'Evidence must agree: Gi0/2 appears under VLAN 20 in show vlan brief; Access Mode VLAN is 20 in show interfaces Gi0/2 switchport; the link is up; the PC has the intended subnet and gateway.',
    evidence: {
      command: 'SW1# show vlan brief\nSW1# show interfaces Gi0/2 switchport\nSW1# show interfaces Gi0/2 status',
      output: 'VLAN Name                             Status    Ports\n1    default                          active    Gi0/1\n20   STAFF                            active    Gi0/2\n30   GUEST                            active    Gi0/3\n\nName: Gi0/2\nAdministrative Mode: static access\nOperational Mode: static access\nAccess Mode VLAN: 20 (STAFF)\n\nPort      Name               Status       Vlan  Duplex  Speed\nGi0/2     STAFF-PC           connected    20    a-full  a-1000',
      interpretation: 'VLAN 20 exists and Gi0/2 is a connected access port in it. These lines verify switch placement; they do not prove the PC has a valid IP lease or that inter-VLAN routing exists.',
    },
  },
  teachingGuide: {
    concept: 'One switch can carry several separate Layer 2 networks. The access port determines which one an ordinary endpoint joins.',
    commonTrap: 'A green link light proves a physical link, not the correct VLAN, IP address, or permitted route.',
    teachBack: 'A printer has a link light and an IP address but cannot reach other staff devices. What two switch commands would you use first, and what would you expect to see?',
  },
  depthV8: {
    concept: 'An access port classifies untagged endpoint frames into a configured data VLAN. The VLAN must be present and active, and the physical interface must be operational. IP addressing and inter-VLAN routing are separate Layer 3 concerns.',
    workedExample: 'SW1(config)# vlan 20\nSW1(config-vlan)# name STAFF\nSW1(config)# interface Gi0/2\nSW1(config-if)# description STAFF-PC\nSW1(config-if)# switchport mode access\nSW1(config-if)# switchport access vlan 20\nSW1(config-if)# no shutdown',
    verification: 'Read show vlan brief, show interfaces Gi0/2 switchport, and show interfaces Gi0/2 status. Then inspect the PC address and test reachability to an intended host in VLAN 20.',
    commonError: 'Assigning a staff IP to a PC on guest VLAN 30 does not move the switchport. The PC may ARP for a staff gateway that is unreachable in its Layer 2 domain.',
  },
  interview: {
    question: 'A PC has a green link light but is in the wrong VLAN. Walk through your evidence, the smallest safe change, and the verification.',
    sampleAnswer: 'I identify the actual switchport, inspect show interfaces Gi0/2 switchport and show vlan brief, then create the intended VLAN if absent and assign the access port. I verify the operational VLAN and link state, renew the client lease if needed, and test intended reachability. I do not treat a green link light as proof of correct VLAN membership.',
  },

};

export const vlanAccessExemplar = authoredLesson;
