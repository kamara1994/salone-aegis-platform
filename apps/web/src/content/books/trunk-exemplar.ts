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

};
