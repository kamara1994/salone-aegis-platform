/** Authored example for CCNA v1.1 objective 2.2: interswitch trunks and 802.1Q. */
export const trunkExemplar = {
  why: 'Two PCs can be correctly assigned to VLAN 20 on different switches and still fail to communicate when their interswitch trunk does not carry VLAN 20.',
  beginner: {
    definition: 'A trunk is one link between switches that carries several VLANs while keeping their traffic separate.',
    analogy: 'Think of one bridge with marked lanes. Cars from Staff lane 20 and Guest lane 30 share the bridge, but each arrives in its own lane. The lane number is like the VLAN tag.',
    example: 'SW1 and SW2 each have staff PCs in VLAN 20. Their interswitch link must carry VLAN 20 for the PCs to share that local network.',
    remember: 'A trunk extends VLANs between switches; it does not route between different VLANs.',
  },
  technical: {
    definition: 'An IEEE 802.1Q trunk carries frames from multiple VLANs over one Ethernet link by identifying tagged traffic with VLAN IDs.',
    explanation: 'The sender tags frames for the tagged VLANs. The receiving switch uses each VLAN ID to keep the traffic in the corresponding Layer 2 broadcast domain. Native VLAN traffic is commonly untagged on Cisco-style trunks; verify both ends.',
    application: 'Confirm trunk operational status, the allowed VLAN list, active VLANs, and the VLANs forwarding on both ends before blaming an endpoint.',
    remember: 'A connected trunk is not proof that the required VLAN is allowed, active, and forwarding.',
  },
  assessments: {
    beginner: [
      { id: '8.04-b1', prompt: 'PC-A and PC-B are both in VLAN 20 but are on different switches. The link between switches is up, yet they cannot communicate. What should you check?', options: ['Whether VLAN 20 can cross the interswitch trunk', 'Whether both PCs have the same name', 'Whether the cables are the same color', 'Whether VLAN 30 has a gateway'], answerIndex: 0, explanation: 'A working physical link can still exclude VLAN 20 from the trunk.' },
      { id: '8.04-b2', prompt: 'What is the main job of an 802.1Q tag on a trunk?', options: ['Encrypt the frame', 'Identify the VLAN the frame belongs to', 'Assign an IP address', 'Make a cable run faster'], answerIndex: 1, explanation: 'The tag carries a VLAN identifier so the receiving switch preserves separation.' },
      { id: '8.04-b3', prompt: 'VLAN 20 and VLAN 30 both cross a trunk. Can a host in VLAN 20 now talk to a host in VLAN 30 without another function?', options: ['Yes, all trunk traffic can mix', 'Yes, if both links are green', 'No, different VLANs still need Layer 3 routing and policy', 'No, trunks carry only one VLAN'], answerIndex: 2, explanation: 'A trunk carries multiple VLANs but keeps their Layer 2 traffic separate.' },
      { id: '8.04-b4', prompt: 'SW1 trunk allows VLANs 10 and 20, but SW2 allows only VLAN 10. Which VLAN is missing from the end-to-end path?', options: ['VLAN 1', 'VLAN 10', 'Both VLANs', 'VLAN 20'], answerIndex: 3, explanation: 'The required VLAN must be permitted on both ends of the path.' },
    ],
    technical: [
      { id: '8.04-t1', prompt: 'Gi0/1 is trunking. `show interfaces trunk` lists VLAN 20 under "allowed" but not under "allowed and active." What should you check next?', options: ['Whether VLAN 20 exists and is active on that switch', 'Whether the PC hostname is STAFF', 'Whether the link LED is blue', 'Whether the router has a default route'], answerIndex: 0, explanation: 'Allowed is not equivalent to active. Check the local VLAN database and status.' },
      { id: '8.04-t2', prompt: 'An existing trunk permits VLANs 10 and 30. You need to permit VLAN 20 without removing those VLANs. Which IOS-style command best fits?', options: ['switchport mode access', 'switchport trunk allowed vlan add 20', 'switchport access vlan 20', 'switchport trunk native vlan 20'], answerIndex: 1, explanation: 'The `add` form preserves the existing allowed list. Replacing the list requires deliberately specifying every needed VLAN.' },
      { id: '8.04-t3', prompt: 'VLAN 20 is allowed and active but absent from "forwarding and not pruned" on an interswitch trunk. Which conclusion is justified?', options: ['The PC must have the wrong IP', 'The VLAN is definitely routed', 'The trunk is not forwarding that VLAN on this port; inspect STP and pruning', 'The native VLAN is always 20'], answerIndex: 2, explanation: 'Allowed and active does not guarantee forwarding. Inspect the forwarding state and any pruning.' },
      { id: '8.04-t4', prompt: 'Two hosts in VLAN 20 communicate across the trunk. A VLAN 20 host still cannot reach a VLAN 30 host. What is the likely missing function?', options: ['An additional 802.1Q tag', 'A longer trunk cable', 'A VLAN name', 'Inter-VLAN routing and an allowing policy'], answerIndex: 3, explanation: 'The trunk preserves separate Layer 2 domains. Traffic between them needs a Layer 3 path and policy.' },
    ],
  },
};
