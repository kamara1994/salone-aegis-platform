'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { modelOf } from '@/lab/catalog';
import { controlPlane } from '@/lab/protocols';
import { useLab } from '@/lab/store';
import type { Device, Iface, LabDoc } from '@/lab/types';
import { cableOnPort, cablesOnPort, cableStatus, CABLE_LABEL, deviceById, otherEnd } from '@/lab/validate';
import { portSummary } from './DeviceHoverCard';

type Led = 'up' | 'degraded' | 'blocking' | 'down' | 'off' | 'admin';
const LED_COLOR: Record<Led, string> = { up: '#2fb36a', degraded: '#e5a23a', blocking: '#e5a23a', down: '#e5484d', off: '#3a4a5c', admin: '#6b7c8f' };
const LED_TEXT: Record<Led, string> = { up: 'link up', degraded: 'link up with problems', blocking: 'STP blocking', down: 'cable in, no link', off: 'nothing plugged in', admin: 'shut down' };

const PHYSICAL = (i: Iface) => !i.parent && !i.bridge && i.type !== 'virtual' && !/^(vlan|loopback|tunnel|port-channel)/i.test(i.name);

function ledOf(doc: LabDoc, d: Device, i: Iface, blocked: boolean): Led {
  if (i.shutdown) return 'admin';
  const cs = i.type === 'wireless' ? cablesOnPort(doc, d.id, i.name) : [cableOnPort(doc, d.id, i.name)].filter(Boolean);
  if (!cs.length) return 'off';
  if (d.power === 'stopped') return 'off';
  const st = cableStatus(doc, cs[0]!);
  if (st.state === 'down' || st.state === 'disabled') return 'down';
  if (blocked) return 'blocking';
  return st.state === 'degraded' ? 'degraded' : 'up';
}

function PortShape({ i, x, y, led, selected, onClick }: { i: Iface; x: number; y: number; led: Led; selected: boolean; onClick: () => void }) {
  const w = i.type === 'sfp' ? 30 : i.type === 'serial' ? 34 : 24;
  const h = i.type === 'sfp' ? 14 : 20;
  const fill = i.type === 'console' ? '#2f6fb0' : i.type === 'terminal' ? '#2f6fb0' : i.type === 'serial' ? '#3b3f46' : '#0d1117';
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${i.name}, ${LED_TEXT[led]}`}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className="cursor-pointer outline-none"
      data-testid={`phys-port-${i.name}`}
      data-led={led}
    >
      <title>{`${i.name}: ${LED_TEXT[led]}`}</title>
      <rect x={x - 3} y={y - 9} width={w + 6} height={h + 13} rx={3} fill={selected ? 'rgba(59,142,232,0.35)' : 'transparent'} stroke={selected ? '#3b8ee8' : 'transparent'} />
      <circle cx={x + w / 2} cy={y - 4} r={2.6} fill={LED_COLOR[led]} />
      {i.type === 'serial' ? (
        <path d={`M${x} ${y} h${w} l-4 ${h} h-${w - 8} z`} fill={fill} stroke="#9aa7b4" strokeWidth={0.8} />
      ) : (
        <rect x={x} y={y} width={w} height={h} rx={i.type === 'sfp' ? 1 : 2} fill={fill} stroke="#9aa7b4" strokeWidth={0.8} />
      )}
      {(i.type === 'copper' || i.type === 'console' || i.type === 'terminal') && <rect x={x + w / 2 - 5} y={y + h - 6} width={10} height={4} fill="#9aa7b4" opacity={0.6} />}
      {i.type === 'wireless' && <path d={`M${x + 4} ${y + 12} q ${w / 2 - 4} -10 ${w - 8} 0`} fill="none" stroke="#9aa7b4" strokeWidth={1.4} />}
    </g>
  );
}

/** Packet Tracer's Physical tab: the front panel drawn from the device's real port list, with live link lights. */
export function PhysicalView({ d, doc }: { d: Device; doc: LabDoc }) {
  const st = useLab();
  const m = modelOf(d);
  const cp = useMemo(() => controlPlane(doc), [doc]);
  const ports = d.interfaces.filter(PHYSICAL);
  const [sel, setSel] = useState<string | null>(null);
  const copper = ports.filter((p) => p.type === 'copper');
  const other = ports.filter((p) => p.type !== 'copper');
  // Switch-style panels put odd ports on top and even below; small devices use one row.
  const twoRows = copper.length > 8;
  const cols = twoRows ? Math.ceil(copper.length / 2) : copper.length;
  const gap = 30;
  const groupGap = (k: number) => Math.floor(k / 6) * 6; // a little space every 6 ports, like real panels
  const copperW = cols * gap + groupGap(Math.max(0, cols - 1));
  const otherW = other.reduce((s, p) => s + (p.type === 'sfp' ? 38 : p.type === 'serial' ? 42 : 32), 0);
  const width = Math.max(260, 30 + copperW + (other.length ? 24 : 0) + otherW + 20);
  const height = twoRows ? 104 : 74;
  const pos: { i: Iface; x: number; y: number }[] = [];
  copper.forEach((p, k) => {
    const col = twoRows ? Math.floor(k / 2) : k;
    const row = twoRows ? k % 2 : 0;
    pos.push({ i: p, x: 24 + col * gap + groupGap(col), y: 34 + row * 34 });
  });
  let x = 24 + copperW + (copper.length ? 24 : 0);
  for (const p of other) {
    pos.push({ i: p, x, y: twoRows ? 50 : 34 });
    x += p.type === 'sfp' ? 38 : p.type === 'serial' ? 42 : 32;
  }
  const blockedOf = (port: string) => !!cp.stp[d.id]?.enabled && cp.stp[d.id]?.ports[port]?.state === 'blocking';
  const sp = sel ? d.interfaces.find((i) => i.name === sel) : undefined;
  const spCables = sp ? (sp.type === 'wireless' ? cablesOnPort(doc, d.id, sp.name) : [cableOnPort(doc, d.id, sp.name)].filter((c): c is NonNullable<typeof c> => !!c)) : [];
  const counts = pos.reduce((acc, p) => ({ ...acc, [ledOf(doc, d, p.i, blockedOf(p.i.name))]: (acc[ledOf(doc, d, p.i, blockedOf(p.i.name))] ?? 0) + 1 }), {} as Record<Led, number>);
  return (
    <div className="space-y-3 text-[12.5px]" data-testid="physical-view">
      <div className="flex gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-pane-2">
          {/* Keep the physical inspector compact; annotated real-world assets are hover-only. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.image} alt="" className="max-h-[72px] max-w-[104px] object-contain" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">
            {m.vendor} {m.name}
          </p>
          <p className="text-muted">{portSummary(m)}</p>
          <p className="text-muted">
            {counts.up ?? 0} up, {(counts.down ?? 0) + (counts.degraded ?? 0) + (counts.blocking ?? 0)} with problems, {counts.off ?? 0} empty, {counts.admin ?? 0} shut down
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-line bg-[#1b2129] p-1">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${d.name} front panel`}>
          <rect x={1} y={1} width={width - 2} height={height - 2} rx={6} fill="#2a313b" stroke="#55606e" />
          <text x={10} y={16} fill="#c9d3dd" fontSize={10} fontFamily="ui-sans-serif, system-ui">
            {d.name} · {m.name}
          </text>
          <circle cx={width - 16} cy={12} r={3.2} fill={d.power === 'stopped' ? '#3a4a5c' : '#2fb36a'}>
            <title>{`Power ${d.power}`}</title>
          </circle>
          {pos.map((p) => (
            <PortShape key={p.i.name} i={p.i} x={p.x} y={p.y} led={ledOf(doc, d, p.i, blockedOf(p.i.name))} selected={sel === p.i.name} onClick={() => setSel(sel === p.i.name ? null : p.i.name)} />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted">
        {(['up', 'degraded', 'blocking', 'down', 'off', 'admin'] as Led[]).map((l) => (
          <span key={l} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: LED_COLOR[l] }} /> {LED_TEXT[l]}
          </span>
        ))}
      </div>
      {sp ? (
        <section className="space-y-2 rounded border border-line p-2" data-testid="phys-port-detail">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold">{sp.name}</span>
            <Badge tone={ledOf(doc, d, sp, blockedOf(sp.name)) === 'up' ? 'good' : ledOf(doc, d, sp, blockedOf(sp.name)) === 'off' ? 'neutral' : 'warn'}>{LED_TEXT[ledOf(doc, d, sp, blockedOf(sp.name))]}</Badge>
          </div>
          <p className="text-muted">
            {sp.type === 'sfp' ? 'SFP cage' : sp.type === 'copper' ? 'RJ-45' : sp.type} · {sp.speed === 'auto' ? `auto (up to ${Math.max(...sp.speeds) >= 1000 ? `${Math.max(...sp.speeds) / 1000} Gb/s` : `${Math.max(...sp.speeds)} Mb/s`})` : `${sp.speed} Mb/s`} · {sp.duplex} duplex
            {sp.mode ? ` · ${sp.mode}${sp.mode === 'access' ? ` VLAN ${sp.vlan ?? 1}` : ''}` : ''}
            {sp.ip ? ` · ${sp.ip}/${sp.prefix}` : ''}
          </p>
          {spCables.length ? (
            <ul className="space-y-0.5">
              {spCables.map((c) => {
                const far = otherEnd(c, d.id, sp.name);
                return (
                  <li key={c.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      {CABLE_LABEL[c.type]} to <span className="font-medium">{deviceById(doc, far.device)?.name}</span> {far.port}
                    </span>
                    <Button size="sm" onClick={() => st.select({ devices: [], cables: [c.id] })}>
                      Inspect cable
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => st.removeCable(c.id)}>
                      Unplug
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">Nothing plugged in.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(!spCables.length || sp.type === 'wireless') && (
              <Button
                size="sm"
                variant="primary"
                data-testid="phys-connect"
                onClick={() => {
                  st.setTool('cable');
                  st.setPendingEnd({ device: d.id, port: sp.name });
                }}
              >
                Plug a cable in here
              </Button>
            )}
            <Button size="sm" onClick={() => st.updateIface(d.id, sp.name, { shutdown: !sp.shutdown })}>
              {sp.shutdown ? 'No shutdown' : 'Shutdown'}
            </Button>
          </div>
          {st.pendingEnd?.device === d.id && st.pendingEnd.port === sp.name && <p className="text-action">Now click the device at the other end on the canvas.</p>}
        </section>
      ) : (
        <p className="text-muted">Click a port to see what is plugged in, plug a cable in, or shut it down.</p>
      )}
      <p className={cx('text-[11px] text-muted', m.autoMdix ? '' : 'text-degraded')}>{m.autoMdix ? 'Copper ports have auto-MDIX: straight or crossover both work.' : 'No auto-MDIX: use the correct straight or crossover cable.'}</p>
    </div>
  );
}
