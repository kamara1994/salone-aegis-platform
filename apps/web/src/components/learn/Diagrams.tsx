'use client';

// Teaching diagrams as inline SVG: they scale cleanly, follow the theme colours and need no image files.
import type { DiagramName } from '@/content/types';

const C = { line: 'var(--line-strong)', text: 'var(--text)', muted: 'var(--muted)', pane: 'var(--pane-2)', v10: '#3b8ee8', v20: '#2fb36a', v30: '#e5a23a', red: '#e5484d' };
const T = ({ x, y, children, size = 12, fill = C.text, anchor = 'middle', weight }: { x: number; y: number; children: React.ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number }) => (
  <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={weight} fontFamily="ui-sans-serif, system-ui">
    {children}
  </text>
);
const Box = ({ x, y, w, h, stroke = C.line, fill = C.pane, r = 6 }: { x: number; y: number; w: number; h: number; stroke?: string; fill?: string; r?: number }) => <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={1.4} />;
const Arrow = ({ x1, y1, x2, y2, color = C.muted, dash }: { x1: number; y1: number; x2: number; y2: number; color?: string; dash?: string }) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 8;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.8} strokeDasharray={dash} />
      <path d={`M${x2} ${y2} L${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)} L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)} z`} fill={color} />
    </g>
  );
};
const Pc = ({ x, y, color, label }: { x: number; y: number; color: string; label: string }) => (
  <g>
    <rect x={x - 16} y={y - 12} width={32} height={22} rx={3} fill={C.pane} stroke={color} strokeWidth={2} />
    <rect x={x - 8} y={y + 10} width={16} height={4} fill={color} />
    <T x={x} y={y + 30} size={11}>
      {label}
    </T>
  </g>
);

function VlanSplit() {
  const ports = Array.from({ length: 12 }, (_, k) => k);
  const color = (k: number) => (k < 4 ? C.v10 : k < 8 ? C.v20 : C.v30);
  return (
    <svg viewBox="0 0 560 230" role="img" aria-label="A switch split into three VLANs">
      <Box x={60} y={40} w={440} h={60} />
      <T x={280} y={32} size={12} fill={C.muted}>
        One physical switch
      </T>
      {ports.map((k) => (
        <rect key={k} x={78 + k * 35} y={58} width={24} height={20} rx={2} fill={color(k)} opacity={0.85} />
      ))}
      {[
        [C.v10, 'VLAN 10 USERS', 130],
        [C.v20, 'VLAN 20 VOICE', 270],
        [C.v30, 'VLAN 30 SERVERS', 410],
      ].map(([c, l, x]) => (
        <g key={l as string}>
          <Arrow x1={x as number} y1={102} x2={x as number} y2={142} color={c as string} />
          <Box x={(x as number) - 70} y={146} w={140} h={50} stroke={c as string} />
          <T x={x as number} y={168} weight={600}>
            {l}
          </T>
          <T x={x as number} y={186} size={11} fill={C.muted}>
            own broadcast domain
          </T>
        </g>
      ))}
    </svg>
  );
}

function AccessTrunk() {
  return (
    <svg viewBox="0 0 600 240" role="img" aria-label="Access ports and a trunk between two switches">
      <Box x={70} y={70} w={150} h={50} />
      <Box x={380} y={70} w={150} h={50} />
      <T x={145} y={100} weight={600}>
        SW1
      </T>
      <T x={455} y={100} weight={600}>
        SW2
      </T>
      <line x1={220} y1={95} x2={380} y2={95} stroke="#a78bfa" strokeWidth={5} />
      <T x={300} y={84} size={11} fill="#a78bfa">
        Trunk Gi0/24: tagged 10, 20 (native 99)
      </T>
      {[
        [100, C.v10, 'PC1 V10'],
        [190, C.v20, 'PC2 V20'],
        [410, C.v10, 'PC3 V10'],
        [500, C.v20, 'PC4 V20'],
      ].map(([x, c, l]) => (
        <g key={l as string}>
          <line x1={x as number} y1={120} x2={x as number} y2={170} stroke={c as string} strokeWidth={2.5} />
          <Pc x={x as number} y={185} color={c as string} label={l as string} />
        </g>
      ))}
      <T x={145} y={150} size={10} fill={C.muted}>
        access ports (untagged)
      </T>
    </svg>
  );
}

function Dot1q() {
  const f: [string, number, string][] = [
    ['Dest MAC', 6, C.pane],
    ['Src MAC', 6, C.pane],
    ['802.1Q tag', 4, '#a78bfa'],
    ['Type', 2, C.pane],
    ['Payload', 12, C.pane],
    ['FCS', 4, C.pane],
  ];
  let x = 20;
  return (
    <svg viewBox="0 0 640 200" role="img" aria-label="Ethernet frame with an 802.1Q tag">
      {f.map(([l, b, c]) => {
        const w = b * 17;
        const el = (
          <g key={l}>
            <rect x={x} y={40} width={w} height={44} fill={c} stroke={C.line} />
            <T x={x + w / 2} y={60} size={11} weight={600} fill={c === C.pane ? C.text : '#fff'}>
              {l}
            </T>
            <T x={x + w / 2} y={76} size={10} fill={c === C.pane ? C.muted : '#fff'}>
              {b} bytes
            </T>
          </g>
        );
        x += w;
        return el;
      })}
      <Arrow x1={260} y1={88} x2={200} y2={130} color="#a78bfa" />
      {[
        ['TPID 0x8100', 16],
        ['PCP 3b', 3],
        ['DEI 1b', 1],
        ['VLAN ID 12b', 12],
      ].reduce<{ x: number; els: React.ReactNode[] }>(
        (acc, [l, bits]) => {
          const w = (bits as number) * 12;
          acc.els.push(
            <g key={l as string}>
              <rect x={acc.x} y={130} width={w} height={34} fill="#a78bfa22" stroke="#a78bfa" />
              <T x={acc.x + w / 2} y={151} size={10}>
                {l}
              </T>
            </g>,
          );
          acc.x += w;
          return acc;
        },
        { x: 90, els: [] },
      ).els}
    </svg>
  );
}

function Roas() {
  return (
    <svg viewBox="0 0 560 280" role="img" aria-label="Router on a stick">
      <Box x={200} y={20} w={160} h={56} />
      <T x={280} y={44} weight={600}>
        R1 Gi0/0/0
      </T>
      <T x={280} y={62} size={10} fill={C.muted}>
        .10 = 10.10.10.1 · .20 = 10.10.20.1
      </T>
      <line x1={280} y1={76} x2={280} y2={130} stroke="#a78bfa" strokeWidth={5} />
      <T x={340} y={108} size={10} fill="#a78bfa" anchor="start">
        802.1Q trunk
      </T>
      <Box x={200} y={130} w={160} h={44} />
      <T x={280} y={157} weight={600}>
        SW1
      </T>
      <line x1={230} y1={174} x2={150} y2={215} stroke={C.v10} strokeWidth={2.5} />
      <line x1={330} y1={174} x2={410} y2={215} stroke={C.v20} strokeWidth={2.5} />
      <Pc x={150} y={228} color={C.v10} label="PC1 VLAN 10, gw 10.10.10.1" />
      <Pc x={410} y={228} color={C.v20} label="PC2 VLAN 20, gw 10.10.20.1" />
    </svg>
  );
}

function Arp() {
  return (
    <svg viewBox="0 0 600 220" role="img" aria-label="ARP request and reply">
      <Pc x={80} y={100} color={C.v10} label="PC 10.10.20.52" />
      <Box x={470} y={80} w={110} h={44} />
      <T x={525} y={107} weight={600}>
        Gateway .1
      </T>
      <Arrow x1={110} y1={70} x2={465} y2={70} color={C.v30} />
      <T x={290} y={60} size={11}>
        ARP request (broadcast ff:ff:ff:ff:ff:ff): who has 10.10.20.1?
      </T>
      <Arrow x1={465} y1={140} x2={110} y2={140} color={C.v20} />
      <T x={290} y={162} size={11}>
        ARP reply (unicast): 10.10.20.1 is at 00:0d:b9:38:6f:0f
      </T>
      <T x={290} y={200} size={11} fill={C.muted}>
        The PC caches the answer in its ARP table (arp -a)
      </T>
    </svg>
  );
}

function PriorityMatrix() {
  const imp = ['Organization', 'Department', 'Team', 'Individual'];
  const urg = ['Critical', 'High', 'Medium', 'Low'];
  const p = [
    ['P1', 'P1', 'P2', 'P3'],
    ['P1', 'P2', 'P3', 'P4'],
    ['P2', 'P3', 'P3', 'P4'],
    ['P2', 'P3', 'P4', 'P4'],
  ];
  const col = { P1: '#e5484d', P2: '#e5a23a', P3: '#3b8ee8', P4: '#6b7c8f' } as Record<string, string>;
  return (
    <svg viewBox="0 0 560 260" role="img" aria-label="Impact and urgency priority matrix">
      <T x={340} y={20} fill={C.muted}>
        Urgency →
      </T>
      {urg.map((u, k) => (
        <T key={u} x={200 + k * 90} y={44} weight={600}>
          {u}
        </T>
      ))}
      {imp.map((i, r) => (
        <g key={i}>
          <T x={140} y={82 + r * 46} anchor="end" weight={600}>
            {i}
          </T>
          {p[r].map((v, k) => (
            <g key={k}>
              <rect x={158 + k * 90} y={58 + r * 46} width={84} height={40} rx={5} fill={col[v]} opacity={0.85} />
              <T x={200 + k * 90} y={83 + r * 46} fill="#fff" weight={700}>
                {v}
              </T>
            </g>
          ))}
        </g>
      ))}
      <T x={60} y={250} anchor="start" size={11} fill={C.muted}>
        ↑ Impact. Security incidents (ransomware, compromised account) start at High urgency.
      </T>
    </svg>
  );
}

function CableTrace() {
  const items: [number, string, string][] = [
    [60, 'PC', 'NIC'],
    [170, 'Wall jack', '2B-14'],
    [300, 'Patch panel', 'port 14'],
    [430, 'Switch', 'Gi0/14'],
  ];
  return (
    <svg viewBox="0 0 540 170" role="img" aria-label="Cable path from PC to switch port">
      {items.map(([x, a, b], k) => (
        <g key={a}>
          <Box x={x - 45} y={50} w={90} h={52} />
          <T x={x} y={72} weight={600}>
            {a}
          </T>
          <T x={x} y={90} size={11} fill={C.muted}>
            {b}
          </T>
          {k < items.length - 1 && <Arrow x1={x + 46} y1={76} x2={items[k + 1][0] - 48} y2={76} color={C.v10} />}
        </g>
      ))}
      <T x={115} y={130} size={10} fill={C.muted}>
        patch cord
      </T>
      <T x={235} y={130} size={10} fill={C.muted}>
        horizontal cable (≤ 90 m)
      </T>
      <T x={365} y={130} size={10} fill={C.muted}>
        patch cord
      </T>
      <T x={270} y={160} size={11}>
        Total channel ≤ 100 m copper
      </T>
    </svg>
  );
}

function SiemFlow() {
  const s: [number, string][] = [
    [60, 'Log sources'],
    [190, 'Agents / syslog'],
    [320, 'SIEM rules'],
    [450, 'Alert → analyst'],
  ];
  return (
    <svg viewBox="0 0 540 150" role="img" aria-label="SIEM data flow">
      {s.map(([x, l], k) => (
        <g key={l}>
          <Box x={x - 55} y={45} w={110} h={46} stroke={k === 3 ? C.red : C.line} />
          <T x={x} y={73} weight={600} size={11}>
            {l}
          </T>
          {k < s.length - 1 && <Arrow x1={x + 56} y1={68} x2={s[k + 1][0] - 58} y2={68} />}
        </g>
      ))}
      <T x={270} y={125} size={11} fill={C.muted}>
        Firewall, DC event logs, endpoints, cloud trails → normalised → correlated → triaged
      </T>
    </svg>
  );
}

function Escalation() {
  const tiers: [number, string, string][] = [
    [50, 'Tier 1', 'Help desk'],
    [170, 'Tier 2', 'Desktop · server · network'],
    [290, 'Tier 3', 'Engineering · vendor'],
  ];
  return (
    <svg viewBox="0 0 560 220" role="img" aria-label="Escalation tiers">
      {tiers.map(([y, a, b], k) => (
        <g key={a}>
          <Box x={60} y={y - 30} w={260} h={50} />
          <T x={190} y={y - 8} weight={600}>
            {a}
          </T>
          <T x={190} y={y + 10} size={11} fill={C.muted}>
            {b}
          </T>
          {k < 2 && <Arrow x1={190} y1={y + 22} x2={190} y2={tiers[k + 1][0] - 32} />}
        </g>
      ))}
      <Box x={370} y={20} w={160} h={50} stroke={C.red} />
      <T x={450} y={42} weight={600}>
        SOC / security
      </T>
      <T x={450} y={60} size={11} fill={C.muted}>
        any suspected incident
      </T>
      <Arrow x1={322} y1={30} x2={366} y2={40} color={C.red} />
    </svg>
  );
}

function MacTable() {
  return (
    <svg viewBox="0 0 580 210" role="img" aria-label="Switch MAC address learning">
      <Pc x={70} y={70} color={C.v20} label="PC bc:24:11:2b:b2:e3" />
      <Box x={200} y={40} w={150} h={60} />
      <T x={275} y={66} weight={600}>
        SW1
      </T>
      <T x={275} y={84} size={10} fill={C.muted}>
        frame in on Gi0/10, VLAN 20
      </T>
      <Arrow x1={100} y1={70} x2={196} y2={70} color={C.v20} />
      <Arrow x1={352} y1={70} x2={400} y2={70} />
      <rect x={404} y={30} width={160} height={100} rx={6} fill={C.pane} stroke={C.line} />
      <T x={484} y={50} size={11} weight={600}>
        MAC table
      </T>
      <T x={414} y={72} anchor="start" size={10}>
        VLAN  MAC             Port
      </T>
      <T x={414} y={90} anchor="start" size={10} fill={C.v20}>
        20    bc24.112b.b2e3  Gi0/10
      </T>
      <T x={414} y={108} anchor="start" size={10} fill={C.muted}>
        20    000d.b938.6f0f  Gi0/24
      </T>
      <T x={290} y={170} size={11} fill={C.muted}>
        Source MAC + port + VLAN are learned; unknown destinations are flooded within the VLAN.
      </T>
    </svg>
  );
}

export function Diagram({ name }: { name: DiagramName }) {
  const map: Record<DiagramName, () => React.ReactElement> = { 'vlan-split': VlanSplit, 'access-trunk': AccessTrunk, dot1q: Dot1q, roas: Roas, arp: Arp, 'priority-matrix': PriorityMatrix, 'cable-trace': CableTrace, 'siem-flow': SiemFlow, escalation: Escalation, 'mac-table': MacTable };
  const D = map[name];
  return D ? <D /> : <p className="text-muted">Diagram “{name}” is not available.</p>;
}
