'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { modelOf } from '@/lab/catalog';
import { hardwareOf, livePsus } from '@/lab/hardware';
import { controlPlane, poeUsage } from '@/lab/protocols';
import { useLab } from '@/lab/store';
import type { Device, Iface, LabDoc } from '@/lab/types';
import { cableOnPort, cablesOnPort, cableStatus, CABLE_LABEL, deviceById, otherEnd } from '@/lab/validate';
import { portSummary } from './DeviceHoverCard';

type Led = 'up' | 'degraded' | 'blocking' | 'down' | 'off' | 'admin' | 'err';
const LED_COLOR: Record<Led, string> = { up: '#2fb36a', degraded: '#e5a23a', blocking: '#e5a23a', down: '#e5484d', off: '#3a4a5c', admin: '#6b7c8f', err: '#ff7a1a' };
const LED_TEXT: Record<Led, string> = { up: 'link up', degraded: 'link up with problems', blocking: 'STP blocking', down: 'cable in, no link', off: 'nothing plugged in', admin: 'shut down', err: 'err-disabled' };

const PHYSICAL = (i: Iface) => !i.parent && !i.bridge && i.type !== 'virtual' && !/^(vlan|loopback|tunnel|port-channel)/i.test(i.name);

function ledOf(doc: LabDoc, d: Device, i: Iface, blocked: boolean): Led {
  if (i.shutdown) return 'admin';
  if (i.errDisabled) return 'err';
  const cs = i.type === 'wireless' ? cablesOnPort(doc, d.id, i.name) : [cableOnPort(doc, d.id, i.name)].filter(Boolean);
  if (!cs.length) return 'off';
  if (d.power === 'stopped') return 'off';
  const st = cableStatus(doc, cs[0]!);
  if (st.state === 'down' || st.state === 'disabled') return 'down';
  if (blocked) return 'blocking';
  return st.state === 'degraded' ? 'degraded' : 'up';
}

function PortShape({ i, x, y, led, selected, onClick, poe }: { i: Iface; x: number; y: number; led: Led; selected: boolean; onClick: () => void; poe?: number }) {
  const w = i.type === 'sfp' ? 30 : i.type === 'serial' ? 34 : 24;
  const h = i.type === 'sfp' ? 14 : 20;
  const fill = i.type === 'console' ? '#2f6fb0' : i.type === 'terminal' ? '#2f6fb0' : i.type === 'serial' ? '#3b3f46' : '#0d1117';
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${i.name}, ${LED_TEXT[led]}${poe ? `, supplying ${poe} W PoE` : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className="cursor-pointer outline-none"
      data-testid={`phys-port-${i.name}`}
      data-led={led}
    >
      <title>{`${i.name}: ${LED_TEXT[led]}${poe ? ` · PoE ${poe} W` : ''}`}</title>
      <rect x={x - 3} y={y - 9} width={w + 6} height={h + 13} rx={3} fill={selected ? 'rgba(59,142,232,0.35)' : 'transparent'} stroke={selected ? '#3b8ee8' : 'transparent'} />
      <circle cx={x + w / 2} cy={y - 4} r={2.6} fill={LED_COLOR[led]} />
      {i.type === 'serial' ? (
        <path d={`M${x} ${y} h${w} l-4 ${h} h-${w - 8} z`} fill={fill} stroke="#9aa7b4" strokeWidth={0.8} />
      ) : (
        <rect x={x} y={y} width={w} height={h} rx={i.type === 'sfp' ? 1 : 2} fill={fill} stroke="#9aa7b4" strokeWidth={0.8} />
      )}
      {(i.type === 'copper' || i.type === 'console' || i.type === 'terminal') && <rect x={x + w / 2 - 5} y={y + h - 6} width={10} height={4} fill="#9aa7b4" opacity={0.6} />}
      {!!poe && <path d={`M${x + w - 5} ${y + 2} l-3 5 h3 l-2 5 l5 -6 h-3 l2 -4 z`} fill="#f5c542" data-poe="on" />}
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
  const [face, setFace] = useState<'front' | 'rear'>('front');
  const hw = hardwareOf(m);
  const poe = m.poeBudgetW ? poeUsage(doc, d.id) : null;
  const poeOn = new Map((poe?.ports ?? []).map((p) => [p.port, p.watts]));
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
      {hw.psus.length > 0 && (
        <div className="flex gap-1" role="radiogroup" aria-label="Panel side">
          {(['front', 'rear'] as const).map((f) => (
            <button key={f} role="radio" aria-checked={face === f} onClick={() => setFace(f)} className={cx('rounded border px-2 py-0.5 text-[11.5px] capitalize', face === f ? 'border-action bg-action/15' : 'border-line text-muted')} data-testid={`phys-face-${f}`}>
              {f} panel
            </button>
          ))}
        </div>
      )}
      {face === 'front' ? (
        <div className="overflow-x-auto rounded border border-line bg-[#1b2129] p-1">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${d.name} front panel`}>
            <rect x={1} y={1} width={width - 2} height={height - 2} rx={6} fill="#2a313b" stroke="#55606e" />
            <text x={10} y={16} fill="#c9d3dd" fontSize={10} fontFamily="ui-sans-serif, system-ui">
              {d.name} · {m.name}
            </text>
            {hw.leds.map((l, k) => {
              // System LEDs sit just after the title, so they stay visible when the panel is wider than the inspector.
              const lx = 10 + `${d.name} · ${m.name}`.length * 5.6 + 18 + k * 40;
              const on = d.power !== 'stopped';
              const color = !on ? '#3a4a5c' : l === 'PoE' ? (poe && poe.used > 0 ? '#2fb36a' : '#3a4a5c') : (l === 'STAT' || l === 'HEALTH' || l === 'STATUS' || l === 'ALM') && d.health !== 'healthy' ? '#e5a23a' : '#2fb36a';
              return (
                <g key={l} data-testid={`phys-led-${l}`} data-on={color !== '#3a4a5c'}>
                  <title>{`${l}: ${color === '#3a4a5c' ? 'off' : color === '#e5a23a' ? 'amber' : 'green'}`}</title>
                  <circle cx={lx + 30} cy={12} r={3} fill={color} />
                  <text x={lx + 25} y={12} textAnchor="end" dominantBaseline="middle" fill="#8a97a6" fontSize={7.5} fontFamily="ui-sans-serif, system-ui">
                    {l}
                  </text>
                </g>
              );
            })}
            {!hw.leds.length && (
              <circle cx={width - 16} cy={12} r={3.2} fill={d.power === 'stopped' ? '#3a4a5c' : '#2fb36a'}>
                <title>{`Power ${d.power}`}</title>
              </circle>
            )}
            {pos.map((p) => (
              <PortShape key={p.i.name} i={p.i} x={p.x} y={p.y} led={ledOf(doc, d, p.i, blockedOf(p.i.name))} selected={sel === p.i.name} onClick={() => setSel(sel === p.i.name ? null : p.i.name)} poe={poeOn.get(p.i.name)} />
            ))}
          </svg>
        </div>
      ) : (
        <RearPanel d={d} />
      )}
      {poe && (
        <div className="space-y-1" data-testid="phys-poe">
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="w-24 text-muted">PoE budget</span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-pane-2" role="meter" aria-valuenow={poe.used} aria-valuemin={0} aria-valuemax={poe.budget} aria-label="PoE power used">
              <span className={cx('block h-full', poe.used > poe.budget * 0.8 ? 'bg-degraded' : 'bg-healthy')} style={{ width: `${Math.min(100, (poe.used / poe.budget) * 100)}%` }} />
            </span>
            <span className="tabular-nums">
              {poe.used.toFixed(1)} / {poe.budget} W
            </span>
          </div>
          {poe.ports.length > 0 && <p className="text-[11px] text-muted">Powering: {poe.ports.map((p) => `${p.device} on ${p.port} (${p.watts} W)`).join(', ')}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-[11px] text-muted">
        {(['up', 'degraded', 'blocking', 'err', 'down', 'off', 'admin'] as Led[]).map((l) => (
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
            {sp.errDisabled && (
              <Button
                size="sm"
                variant="primary"
                data-testid="phys-recover"
                onClick={() => {
                  st.updateIface(d.id, sp.name, { shutdown: true });
                  st.updateIface(d.id, sp.name, { shutdown: false });
                }}
              >
                Recover (shutdown / no shutdown)
              </Button>
            )}
          </div>
          {sp.errDisabled && <p className="rounded bg-[#ff7a1a]/10 p-2 text-[#ff9a4a]">Err-disabled: {sp.errDisabled}.</p>}
          {d.kind === 'switch' && sp.mode !== 'routed' && <PortSecurityEditor d={d} i={sp} />}
          {st.pendingEnd?.device === d.id && st.pendingEnd.port === sp.name && <p className="text-action">Now click the device at the other end on the canvas.</p>}
        </section>
      ) : (
        <p className="text-muted">Click a port to see what is plugged in, plug a cable in, or shut it down.</p>
      )}
      <p className={cx('text-[11px] text-muted', m.autoMdix ? '' : 'text-degraded')}>{m.autoMdix ? 'Copper ports have auto-MDIX: straight or crossover both work.' : 'No auto-MDIX: use the correct straight or crossover cable.'}</p>
    </div>
  );
}

/** Rear panel: power supplies (click to pull or insert), fans, module slots. */
function RearPanel({ d }: { d: Device }) {
  const st = useLab();
  const m = modelOf(d);
  const hw = hardwareOf(m);
  const on = d.power !== 'stopped';
  const live = livePsus(d, hw);
  const W = Math.max(300, 40 + hw.psus.length * 96 + hw.fans * 34 + hw.slots.length * 92);
  const toggle = (slot: string) => {
    const off = d.psuOff ?? [];
    const next = off.includes(slot) ? off.filter((x) => x !== slot) : [...off, slot];
    const liveAfter = hw.psus.filter((p) => p.kind !== 'poe' && !next.includes(p.slot)).length;
    st.updateDevice(d.id, { psuOff: next.length ? next : undefined });
    if (liveAfter === 0 && on) st.setPower(d.id, 'stopped');
    else if (liveAfter > 0 && live.length === 0 && !on) st.setPower(d.id, 'running');
  };
  let x = 14;
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded border border-line bg-[#1b2129] p-1">
        <svg width={W} height={96} viewBox={`0 0 ${W} 96`} role="group" aria-label={`${d.name} rear panel`} data-testid="phys-rear">
          <rect x={1} y={1} width={W - 2} height={94} rx={6} fill="#262c35" stroke="#55606e" />
          {hw.psus.map((p) => {
            const px = x;
            x += 96;
            const isOn = p.kind === 'poe' ? on : !(d.psuOff ?? []).includes(p.slot);
            return (
              <g key={p.slot} role="button" tabIndex={p.kind === 'poe' ? -1 : 0} aria-label={`${p.slot} ${p.watts} W, ${isOn ? 'installed and on' : 'pulled'}${p.kind === 'poe' ? '' : '. Press to ' + (isOn ? 'pull' : 'insert')}`} className={p.kind === 'poe' ? '' : 'cursor-pointer outline-none'} onClick={() => p.kind !== 'poe' && toggle(p.slot)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && p.kind !== 'poe' && (e.preventDefault(), toggle(p.slot))} data-testid={`phys-psu-${p.slot}`} data-on={isOn}>
                <title>{`${p.slot}: ${p.watts} W ${p.kind.toUpperCase()}, ${isOn ? 'on' : 'pulled'}`}</title>
                <rect x={px} y={14} width={84} height={66} rx={4} fill={isOn ? '#323a45' : '#1a1f26'} stroke={isOn ? '#7d8a99' : '#4a5562'} strokeDasharray={isOn ? undefined : '4 3'} />
                {isOn && (
                  <>
                    {Array.from({ length: 5 }, (_, k) => (
                      <line key={k} x1={px + 10} x2={px + 58} y1={26 + k * 8} y2={26 + k * 8} stroke="#4b5563" strokeWidth={2} />
                    ))}
                    <circle cx={px + 72} cy={26} r={3.2} fill={on ? '#2fb36a' : '#e5a23a'} />
                    <rect x={px + 64} y={50} width={14} height={18} rx={2} fill="#14181d" stroke="#7d8a99" />
                  </>
                )}
                <text x={px + 42} y={92} textAnchor="middle" fill="#a9b5c2" fontSize={9} fontFamily="ui-sans-serif, system-ui">
                  {isOn ? `${p.slot} ${p.watts} W` : `${p.slot} empty`}
                </text>
              </g>
            );
          })}
          {Array.from({ length: hw.fans }, (_, k) => {
            const fx = x + 16;
            x += 34;
            return (
              <g key={`fan${k}`} data-testid="phys-fan" data-spin={on}>
                <title>{`Fan ${k + 1}: ${on ? 'spinning' : 'stopped'}`}</title>
                <circle cx={fx} cy={46} r={14} fill="#14181d" stroke="#6b7684" />
                <g className={on ? 'motion-safe:animate-spin' : ''} style={{ transformOrigin: `${fx}px 46px`, animationDuration: '0.8s' }}>
                  {[0, 120, 240].map((a) => (
                    <path key={a} d={`M${fx} 46 q 6 -9 0 -12 q -4 5 0 12`} fill="#8a97a6" transform={`rotate(${a} ${fx} 46)`} />
                  ))}
                </g>
              </g>
            );
          })}
          {hw.slots.map((sl) => {
            const sx = x + 6;
            x += 92;
            return (
              <g key={sl.name} data-testid="phys-slot">
                <title>{`${sl.name}: ${sl.module ?? 'empty (blank cover)'}`}</title>
                <rect x={sx} y={24} width={82} height={42} rx={3} fill={sl.module ? '#2f3946' : '#1f252d'} stroke="#6b7684" strokeDasharray={sl.module ? undefined : '3 3'} />
                <text x={sx + 41} y={42} textAnchor="middle" fill="#c9d3dd" fontSize={8.5} fontFamily="ui-sans-serif, system-ui">
                  {sl.name}
                </text>
                <text x={sx + 41} y={56} textAnchor="middle" fill={sl.module ? '#8fb3d9' : '#6b7684'} fontSize={7.5} fontFamily="ui-sans-serif, system-ui">
                  {(sl.module ?? 'blank').slice(0, 20)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-muted">
        {hw.psus.some((p) => p.kind === 'poe')
          ? 'Powered over Ethernet from the switch port it is plugged into.'
          : hw.redundant
            ? `Redundant power: ${live.length} of ${hw.psus.length} supplies on. Pull one to see the device stay up; pull both and it powers off.`
            : 'Single power supply: pulling it powers the device off.'}
      </p>
    </div>
  );
}

function PortSecurityEditor({ d, i }: { d: Device; i: Iface }) {
  const st = useLab();
  const ps = i.portSecurity ?? { enabled: false, max: 1, sticky: false, violation: 'shutdown' as const, macs: [] };
  const set = (p: Partial<Iface>) => st.updateIface(d.id, i.name, p);
  const dynamic = !!i.dtp;
  return (
    <div className="space-y-1.5 rounded border border-line p-2 text-[12px]" data-testid="phys-port-security">
      <p className="font-semibold">Port protection</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5" title={dynamic ? 'Port security needs a static access or trunk port' : undefined}>
          <input type="checkbox" disabled={dynamic} checked={ps.enabled} onChange={(e) => set({ portSecurity: { ...ps, enabled: e.target.checked } })} aria-label="Port security" /> Port security
        </label>
        <label className="flex items-center gap-1">
          max
          <input type="number" min={1} max={64} className="w-12 rounded border border-line bg-ink px-1" disabled={!ps.enabled} value={ps.max} onChange={(e) => set({ portSecurity: { ...ps, max: Math.max(1, Number(e.target.value) || 1) } })} aria-label="Maximum MAC addresses" />
        </label>
        <select className="h-7 rounded border border-line bg-ink px-1" disabled={!ps.enabled} value={ps.violation} onChange={(e) => set({ portSecurity: { ...ps, violation: e.target.value as typeof ps.violation } })} aria-label="Violation mode">
          <option value="shutdown">shutdown</option>
          <option value="restrict">restrict</option>
          <option value="protect">protect</option>
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" disabled={!ps.enabled} checked={ps.sticky} onChange={(e) => set({ portSecurity: { ...ps, sticky: e.target.checked, macs: e.target.checked ? ps.macs : [] } })} aria-label="Sticky" /> sticky
        </label>
      </div>
      {ps.enabled && <p className="font-mono text-[11px] text-muted">Secure MACs: {ps.macs.length ? ps.macs.join(', ') : 'none yet (learned dynamically)'}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!i.portfast} onChange={(e) => set({ portfast: e.target.checked })} /> PortFast
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!i.bpduGuard} onChange={(e) => set({ bpduGuard: e.target.checked || undefined })} /> BPDU guard
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!i.rootGuard} onChange={(e) => set({ rootGuard: e.target.checked || undefined })} /> Root guard
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!i.dhcpTrust} onChange={(e) => set({ dhcpTrust: e.target.checked || undefined })} /> DHCP snooping / DAI trust
        </label>
      </div>
    </div>
  );
}
