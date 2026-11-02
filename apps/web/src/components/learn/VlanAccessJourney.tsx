'use client';

import { type ReactNode } from 'react';

type Props = { stage: string; level: 'beginner' | 'technical' };

const lines = [
  { command: 'vlan 20', reason: 'Create the staff VLAN in the switch VLAN database.' },
  { command: 'name STAFF', reason: 'Give VLAN 20 a readable name; the number still determines membership.' },
  { command: 'interface Gi0/2', reason: 'Select the port physically connected to STAFF-PC.' },
  { command: 'switchport mode access', reason: 'Make this an endpoint-facing access port.' },
  { command: 'switchport access vlan 20', reason: 'Place ordinary traffic arriving on this port in VLAN 20.' },
  { command: 'no shutdown', reason: 'Ensure the interface is administratively enabled.' },
];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-line-strong bg-pane p-5"><h2 className="mb-3 text-[17px] font-semibold text-text">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-text">{children}</div></section>;
}

export function VlanAccessJourney({ stage, level }: Props) {
  const beginner = level === 'beginner';

  if (stage === 'meaning') return <>
    <Card title="A green link light, but the wrong network"><p>STAFF-PC is plugged into switch port Gi0/2. Its cable works, yet it receives a guest address and cannot reach staff services. The design says Gi0/2 belongs to staff VLAN 20; guests use VLAN 30.</p><p>{beginner ? 'The switch port determines which group the PC joins. A working cable confirms the physical connection but says nothing about that group.' : 'Gi0/2 is operational but may be classified into VLAN 30, so its DHCP traffic enters the guest broadcast domain.'}</p></Card>
    <Card title="The first useful check"><p>Read the port’s operational access VLAN. The cable and PC name cannot establish which Layer 2 domain receives the frames.</p></Card>
  </>;

  if (stage === 'mental-model') return <>
    <Card title={beginner ? 'Picture two offices in one building' : 'The Layer 2 model'}>
      <p>{beginner ? 'Imagine one building with two locked offices: Staff and Guest. The switch is the building. VLAN 20 is the Staff office; VLAN 30 is the Guest office. Gi0/2 is a door. A PC plugged into that door joins the office assigned to the door.' : 'A switch may host multiple Layer 2 broadcast domains. An access interface classifies ordinary untagged ingress frames into one configured data VLAN. Gi0/2’s access VLAN determines where STAFF-PC’s frames enter the switched topology.'}</p>
      <p>{beginner ? 'Renaming the PC or giving it a Staff address does not move the door. You must assign Gi0/2 to VLAN 20.' : 'Changing the endpoint IP does not alter ingress VLAN classification. A VLAN ID and an IPv4 subnet are distinct configuration choices, even though designs commonly map one subnet to one VLAN.'}</p>
    </Card>
    <Card title="Where the comparison stops"><p>{beginner ? 'Offices are only a picture. Real switches separate Ethernet broadcasts; a router or Layer 3 switch can carry allowed traffic between the VLANs.' : 'VLAN separation is at Layer 2. A VLAN declaration alone does not create a DHCP scope, SVI, default gateway, or inter-VLAN route.'}</p></Card>
  </>;

  if (stage === 'mechanism') return <>
    <Card title="Three separate decisions"><ol className="list-decimal space-y-3 pl-6"><li><strong>Does VLAN 20 exist?</strong> Creating a VLAN gives the switch a named Layer 2 group.</li><li><strong>Which VLAN owns Gi0/2?</strong> Assigning an access port puts the attached PC’s ordinary traffic in that group.</li><li><strong>Can the PC communicate?</strong> Link state, a suitable IP lease, and routing or policy determine reachability.</li></ol></Card>
    <Card title="A limit that matters"><p>{beginner ? 'Creating VLAN 20 by itself does not move Gi0/2. Giving the PC a Staff IP while Gi0/2 stays in VLAN 30 also does not move it.' : 'An access VLAN change is a Layer 2 classification change. Confirm the interface and VLAN are operational; then independently validate DHCP, addressing, and any Layer 3 path.'}</p></Card>
  </>;

  if (stage === 'worked-example') return <>
    <Card title="Work it through: STAFF-PC on Gi0/2"><p>First confirm the cable really reaches Gi0/2. On SW1, <code>show interfaces Gi0/2 switchport</code> reports <code>Access Mode VLAN: 30</code>. That explains why a healthy link still puts the PC among guests.</p><p>{beginner ? 'Now move only that port into the Staff group. Read each command and what it changes.' : 'Apply the smallest change to the verified interface. These are Cisco IOS style configuration commands; prompt and exact interface name vary by platform.'}</p></Card>
    <Card title="Configuration, line by line"><ol className="space-y-3">{lines.map((line, i) => <li key={line.command} className="grid gap-1 border-b border-line pb-2 last:border-0 sm:grid-cols-[14rem_1fr]"><code className="font-mono text-[13px] text-action">{i + 1}. {line.command}</code><span>{line.reason}</span></li>)}</ol><p className="text-[13px] text-muted">Enter VLAN commands in global/VLAN configuration mode and interface commands under Gi0/2. Save the configuration after verification if the exercise requires persistence.</p></Card>
    <Card title="What changed"><p>Gi0/2 now classifies STAFF-PC traffic into VLAN 20. The PC may still hold its old guest DHCP lease, so the switch change is not yet end-to-end proof.</p></Card>
  </>;

  if (stage === 'verification') return <>
    <Card title="Read the switch evidence"><pre className="overflow-auto rounded-md bg-ink p-4 font-mono text-[12px] leading-6 text-text">{'SW1# show vlan brief\n20   STAFF    active    Gi0/2\n30   GUEST    active    Gi0/3\n\nSW1# show interfaces Gi0/2 switchport\nOperational Mode: static access\nAccess Mode VLAN: 20 (STAFF)\n\nSW1# show interfaces Gi0/2 status\nGi0/2  STAFF-PC  connected  20  a-full  a-1000'}</pre><p><strong>Read it together:</strong> VLAN 20 exists, Gi0/2 is assigned to it, and the link is connected. These lines do not prove the PC has a current Staff IP lease or that routing is present.</p></Card>
    <Card title="Apply the same rule to another port"><p>Gi0/4 also needs to join VLAN 20. After selecting <code>interface Gi0/4</code> and setting <code>switchport mode access</code>, the command <code>switchport access vlan 20</code> assigns its data VLAN. A trunk allowed list changes a different kind of port, while an IP address or VLAN name does not assign the access port.</p></Card>
    <Card title="Finish the end-to-end check"><p>Renew STAFF-PC’s DHCP lease if needed. Check its address and gateway, then test an intended host in VLAN 20. If it must reach VLAN 30, separately verify that inter-VLAN routing and policy allow it.</p><a href="/lab?workbook=vlans-trunking" className="inline-flex rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white">Practice in the VLAN lab</a></Card>
  </>;

  if (stage === 'troubleshooting') return <>
    <Card title="Same symptom, different cause"><p>Gi0/2 now reports VLAN 20 and <code>connected</code>, but STAFF-PC still shows its former guest address. The switch evidence supports the new port membership. The client may retain its previous DHCP lease; renew it and inspect the resulting address and gateway before changing the switch again. If renewal fails, trace the DHCP path.</p></Card>
    <Card title="Compare two faults"><div className="overflow-x-auto"><table className="w-full text-left text-[13px]"><thead><tr><th className="p-2">Evidence</th><th className="p-2">Likely next action</th></tr></thead><tbody><tr className="border-t border-line"><td className="p-2">Access Mode VLAN: 30; design says 20</td><td className="p-2">Correct Gi0/2 access VLAN, then verify.</td></tr><tr className="border-t border-line"><td className="p-2">Access Mode VLAN: 20; old guest IP remains</td><td className="p-2">Renew the client lease; investigate DHCP if it fails.</td></tr><tr className="border-t border-line"><td className="p-2">VLAN 20 and Staff IP correct; VLAN 30 unreachable</td><td className="p-2">Check whether routing and policy should permit that traffic.</td></tr></tbody></table></div></Card>
  </>;

  if (stage === 'recap') return <>
    <Card title="Carry the diagnosis forward"><p>A green light proves the physical link. The operational access VLAN determines which Layer 2 domain receives the PC’s traffic. The client lease and any inter-VLAN route must be checked separately.</p></Card>
    <Card title="The next ideas"><p>A trunk carries VLAN 20 between switches while preserving its separation from VLAN 30. Communication between those VLANs requires Layer 3 routing and policy.</p></Card>
  </>;

  return null;
}
