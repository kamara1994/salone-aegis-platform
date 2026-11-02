'use client';

import { type ReactNode } from 'react';

type Props = { stage: string; level: 'beginner' | 'technical' };

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-line-strong bg-pane p-5"><h2 className="mb-3 text-[17px] font-semibold text-text">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-text">{children}</div></section>;
}

export function TrunkJourney({ stage, level }: Props) {
  const beginner = level === 'beginner';

  if (stage === 'meaning') return <>
    <Card title="The problem after the access ports are correct"><p>STAFF-PC on SW1 and STAFF-PRINTER on SW2 are each on a working access port in VLAN 20. They still cannot reach each other. The switches are joined by Gi0/1, and that physical link is up.</p><p>{beginner ? 'The port on each end puts its device in the right group. Now ask whether the group can cross the link between switches.' : 'The endpoint access VLANs and physical interswitch link are verified. Investigate whether VLAN 20 has an operational Layer 2 path across the interswitch link.'}</p></Card>
    <Card title="Why the link light is insufficient"><p>A link can carry VLAN 10 while excluding VLAN 20. Its green light confirms the physical connection, but the VLAN 20 endpoints still have no Layer 2 path between switches.</p></Card>
  </>;

  if (stage === 'mental-model') return <>
    <Card title={beginner ? 'One bridge, several marked lanes' : 'One physical link, multiple Layer 2 domains'}><p>{beginner ? 'Picture the interswitch cable as one bridge. Staff traffic takes lane 20 and Guest traffic takes lane 30. The bridge can carry both, but the lane markings keep them separate at the far switch.' : 'An IEEE 802.1Q trunk transports frames for multiple VLANs. A VLAN ID in tagged frames lets the receiving switch associate each frame with the proper Layer 2 broadcast domain.'}</p><p>{beginner ? 'On the real link, a VLAN tag is the lane marking. If VLAN 20 is not allowed across the link, Staff traffic cannot cross it.' : 'Many Cisco-style trunks send native VLAN traffic untagged. The native VLAN must be considered separately from the tagged data VLANs; verify operational behavior on the actual equipment.'}</p></Card>
    <Card title="The boundary"><p>A trunk extends VLAN 20 between switches. It does not let VLAN 20 talk to VLAN 30. Communication between those groups requires routing and an allowing policy.</p></Card>
  </>;

  if (stage === 'mechanism') return <>
    <Card title="Four checks, in order"><ol className="list-decimal space-y-3 pl-6"><li><strong>Trunk status:</strong> is the connected port operating as a trunk?</li><li><strong>Allowed list:</strong> does each end permit VLAN 20?</li><li><strong>Active VLAN:</strong> does VLAN 20 exist and remain active on both switches?</li><li><strong>Forwarding:</strong> is VLAN 20 forwarding across the chosen path rather than blocked or pruned?</li></ol><p>{beginner ? 'A yes on the first check does not automatically mean yes on the next three.' : 'Read the separate sections of `show interfaces trunk`; they represent different predicates. Do not treat an allowed VLAN as proof of an active, forwarding VLAN.'}</p></Card>
  </>;

  if (stage === 'worked-example') return <>
    <Card title="Read the fault before changing anything"><pre className="overflow-auto rounded-md bg-ink p-4 font-mono text-[12px] leading-6 text-text">{'SW1# show interfaces trunk\nPort   Mode  Encapsulation  Status     Native vlan\nGi0/1  on    802.1q         trunking   1\n\nPort   Vlans allowed on trunk\nGi0/1  10,30\n\nPort   Vlans allowed and active in management domain\nGi0/1  10,30'}</pre><p><strong>Interpretation:</strong> Gi0/1 is a trunk, but VLAN 20 is absent from the allowed list. The physical connection is healthy; this VLAN cannot use that path. Check the corresponding trunk on SW2 as well.</p></Card>
    <Card title="Smallest justified change"><ol className="list-decimal space-y-3 pl-6"><li>Confirm Gi0/1 connects SW1 to SW2 and VLAN 20 exists on both switches.</li><li>Under the appropriate trunk interface, use <code>switchport trunk allowed vlan add 20</code> if VLANs 10 and 30 must remain allowed.</li><li>Inspect the allowed, active, and forwarding sections of <code>show interfaces trunk</code> on both switches.</li><li>Test the two VLAN 20 endpoints. Keep their IP settings in the intended subnet.</li></ol><p className="text-[13px] text-muted">IOS-style syntax is shown for an isolated lab. Confirm interface names and existing allowed lists before applying a change.</p></Card>
  </>;

  if (stage === 'verification') return <>
    <Card title="Now the evidence should agree"><pre className="overflow-auto rounded-md bg-ink p-4 font-mono text-[12px] leading-6 text-text">{'SW1# show interfaces trunk\nPort   Mode  Encapsulation  Status     Native vlan\nGi0/1  on    802.1q         trunking   1\n\nPort   Vlans allowed on trunk\nGi0/1  10,20,30\n\nPort   Vlans allowed and active in management domain\nGi0/1  10,20,30\n\nPort   Vlans in spanning tree forwarding state and not pruned\nGi0/1  10,20,30'}</pre><p>VLAN 20 is allowed, active, and forwarding on SW1 Gi0/1. Repeat on SW2. Then check endpoint addresses and test connectivity; this single output does not prove end-to-end success.</p></Card>
    <Card title="Preserve the existing VLANs"><p>If another trunk allows VLANs 10 and 30, <code>switchport trunk allowed vlan add 20</code> adds VLAN 20 without replacing the existing list. Replacing the list with only 20 could silently remove both other VLANs. Verify the resulting list on both ends.</p></Card>
  </>;

  if (stage === 'troubleshooting') return <>
    <Card title="A second fault: allowed does not mean forwarding"><p>Suppose VLAN 20 appears under “Vlans allowed on trunk” but not under “Vlans allowed and active.” Check whether VLAN 20 exists and is active locally. If it appears there but not under “forwarding state and not pruned,” inspect spanning tree and pruning.</p><p>{beginner ? 'Read the output as a series of gates: the VLAN must pass each gate to use this port.' : 'Distinguish VLAN database state from per-port forwarding state. A trunk can be operational while one VLAN is excluded, inactive, blocked, or pruned.'}</p></Card>
    <Card title="Do not fix the wrong layer"><p>If VLAN 20 hosts can reach each other across switches but cannot reach a VLAN 30 host, the trunk has performed its job. Investigate inter-VLAN routing and policy instead of repeatedly changing the trunk.</p></Card>
  </>;

  if (stage === 'recap') return <>
    <Card title="Read the trunk as a series of gates"><p>The port must be operationally trunking; the VLAN must be allowed, active, and forwarding along the chosen path. Each condition is a separate line of evidence. The same check belongs on the opposite switch.</p></Card>
    <Card title="Keep the boundary clear"><p>A trunk extends one VLAN across switches but does not route between VLANs. The next lesson examines the native VLAN, whose untagged behavior deserves a separate check.</p></Card>
  </>;

  return null;
}
