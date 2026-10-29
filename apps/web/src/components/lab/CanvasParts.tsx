'use client';

import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, useInternalNode, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { KIND_LABEL, modelOf } from '@/lab/catalog';
import { DEVICE_H, DEVICE_W } from '@/lab/inventory';
import { primaryIp } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { DeviceHoverCard } from './DeviceHoverCard';
import type { Annotation, Cable, CableStatus, Device } from '@/lab/types';
import { CABLE_LABEL } from '@/lab/validate';
import { cx, fmtBytes } from '@/components/ui';

export type CompareMark = 'added' | 'changed' | 'removed';

export type DeviceNodeData = {
  device: Device;
  linksUp: number;
  linksTotal: number;
  compare?: CompareMark;
  labels: 'full' | 'compact';
  connectable: boolean;
  pending: boolean;
  onPath: boolean;
  ghost?: boolean;
  stpRoot?: boolean;
};

export type CableEdgeData = {
  cable: Cable;
  status: CableStatus;
  portLabels: boolean;
  flow?: { bytes_per_s: number; allowed: number; denied: number; top_app?: string };
  compare?: CompareMark;
  ghost?: boolean;
  onPath: boolean;
  /** Which ends spanning tree is blocking */
  blocked?: ('a' | 'b')[];
  /** EtherChannel bundle this cable belongs to */
  channel?: { group: number; ok: boolean };
  onEndPointerDown?: (cableId: string, end: 'a' | 'b', e: React.PointerEvent) => void;
  onBendPointerDown?: (cableId: string, e: React.PointerEvent) => void;
  onBendReset?: (cableId: string) => void;
};

export function primaryMac(d: Device) {
  return d.interfaces.find((i) => i.ip && i.mac)?.mac ?? d.interfaces.find((i) => i.mac)?.mac;
}
export function primaryVlan(d: Device) {
  return d.interfaces.find((i) => i.ip && i.vlan !== undefined)?.vlan ?? d.interfaces.find((i) => i.vlan !== undefined && !i.parent && d.kind !== 'switch')?.vlan;
}

/** High-detail, model-specific visuals used by the hover preview. */
const REAL_ASSET: Record<string, string> = {
  isr4331: '/lab/generated/labeled/cisco-isr-4331-annotated.png',
  isr1941: '/lab/generated/labeled/cisco-1941-annotated.png',
  c2960x24: '/lab/generated/labeled/cisco-catalyst-2960x-annotated.png',
  c2960x24ps: '/lab/generated/labeled/cisco-catalyst-2960x-annotated.png',
  'c9300-24t': '/lab/generated/labeled/cisco-catalyst-9300-annotated.png',
  dec2750: '/lab/generated/labeled/opnsense-dec2750-annotated.png',
  r650: '/lab/generated/labeled/dell-poweredge-r650-annotated.png',
  'proxmox-vm': '/lab/generated/labeled/proxmox-vm-annotated.png',
  'aws-vpc': '/lab/generated/labeled/aws-vpc-annotated.png',
  internet: '/lab/generated/labeled/internet-wan-annotated.png',
  optiplex: '/lab/generated/labeled/dell-optiplex-7010-annotated.png',
  thinkpad: '/lab/generated/labeled/thinkpad-t14-annotated.png',
  'legacy-pc': '/lab/generated/labeled/legacy-pc-annotated.png',
  c9120: '/lab/generated/labeled/catalyst-9120axi-annotated.png',
  'axis-cam': '/lab/generated/labeled/axis-m3106-annotated.png',
  'iot-sensor': '/lab/generated/labeled/environmental-sensor-annotated.png',
};

function deviceSummary(d: Device, up: number, total: number) {
  const m = modelOf(d);
  const lines = [
    `${d.name}: ${m.vendor} ${m.name} (${KIND_LABEL[d.kind]})`,
    `Power ${d.power}, health ${d.health}, ${up}/${total} links up`,
    `IP ${primaryIp(d) ?? 'none'}${primaryVlan(d) !== undefined ? `, VLAN ${primaryVlan(d)}` : ''}`,
    `MAC ${primaryMac(d) ?? 'not reported'}`,
    'Interfaces:',
    ...d.interfaces.filter((i) => i.type !== 'console' && i.type !== 'terminal').slice(0, 12).map((i) => `  ${i.name}${i.ip ? ` ${i.ip}/${i.prefix}` : ''}${i.shutdown ? ' (shutdown)' : ''}`),
  ];
  if (d.interfaces.length > 12) lines.push(`  …and ${d.interfaces.length - 12} more`);
  return lines.join('\n');
}

export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<Node<DeviceNodeData>>) {
  const { device: d, linksUp, linksTotal, compare, labels, connectable, pending, onPath, ghost, stpRoot } = data;
  const m = modelOf(d);
  const off = d.power === 'stopped';
  const health = off ? 'down' : d.health;
  const ip = primaryIp(d);
  const vlan = primaryVlan(d);
  const mac = primaryMac(d);
  const conn = linksTotal === 0 ? 'not connected' : `${linksUp}/${linksTotal} up`;
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    timer.current = null;
    hideTimer.current = null;
    setHover(null);
  };
  const scheduleCancel = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 180);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  return (
    <div
      onMouseEnter={(e) => {
        if (ghost || e.buttons) return;
        const el = e.currentTarget;
        timer.current = setTimeout(() => setHover(el.getBoundingClientRect()), 450);
      }}
      onMouseLeave={scheduleCancel}
      onPointerDown={cancel}
      onWheel={cancel}
      aria-description={deviceSummary(d, linksUp, linksTotal)}
      data-device-id={d.id}
      data-testid={`lab-device-${d.name}`}
      aria-label={`${d.name}, ${KIND_LABEL[d.kind]}, ${health}, ${conn}`}
      className={cx(
        'group relative flex flex-col items-center rounded-[8px] border bg-pane/95 px-1.5 pt-1 pb-1.5 text-center shadow-sm',
        selected ? 'border-action ring-2 ring-action/40' : pending ? 'border-action border-dashed' : onPath ? 'border-action/70' : 'border-line-strong',
        compare === 'added' && 'ring-2 ring-healthy/70',
        compare === 'changed' && 'ring-2 ring-degraded/80',
        ghost && 'border-dashed border-down/70 opacity-55',
      )}
      style={{ width: DEVICE_W, minHeight: labels === 'full' ? DEVICE_H : 78 }}
    >
      {hover && <DeviceHoverCard device={d} anchor={hover} onEnter={keep} onLeave={scheduleCancel} />}
      <Handle type="source" position={Position.Top} id="c" isConnectable={connectable} className={cx('!absolute !inset-0 !h-full !w-full !translate-0 !rounded-[8px] !border-0 !bg-transparent', connectable ? '!cursor-crosshair' : '!pointer-events-none')} />
      {compare && <span className={cx('absolute -top-2 left-1 rounded px-1 text-[9.5px] font-semibold text-white', compare === 'added' ? 'bg-healthy' : compare === 'changed' ? 'bg-degraded' : 'bg-down')}>{compare === 'added' ? 'New' : compare === 'changed' ? 'Changed' : 'Removed'}</span>}
      {d.origin === 'design' && !compare && <span className="absolute -top-2 left-1 rounded border border-line-strong bg-pane px-1 text-[9.5px] text-muted">Design</span>}
      {stpRoot && <span className="absolute -top-2 right-1 rounded bg-action px-1 text-[9.5px] font-semibold text-white" title="Spanning-tree root bridge">Root</span>}
      {d.powerReason && (
        <span className="absolute -bottom-2 left-1/2 max-w-[120px] -translate-x-1/2 truncate rounded bg-down px-1 text-[9.5px] font-semibold text-white" title={d.powerReason} data-testid={`no-power-${d.name}`}>
          No PoE
        </span>
      )}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.image} alt="" draggable={false} className={cx('pointer-events-none h-[46px] w-[70px] select-none object-contain', off && 'grayscale opacity-60')} />
        <span className={cx('absolute top-0.5 -left-1.5 size-2.5 rounded-full border border-pane', off ? 'bg-down' : d.power === 'running' ? 'bg-healthy' : 'bg-faint')} title={`Power ${d.power}`} aria-hidden />
        <span className={cx('absolute top-0.5 -right-1.5 size-2.5 rounded-full border border-pane', health === 'healthy' ? 'bg-healthy' : health === 'degraded' ? 'bg-degraded' : health === 'down' ? 'bg-down' : 'bg-faint')} title={`Health ${health}`} aria-hidden />
      </div>
      <div className="pointer-events-none invisible absolute left-full top-0 z-50 ml-3 w-[290px] rounded-lg border border-line-strong bg-pane p-2 text-left opacity-0 shadow-xl transition-opacity duration-100 group-hover:visible group-hover:opacity-100">
        <div className="mb-1 text-[11px] font-semibold text-text">Real-world view · {m.name}</div>
        <div className="mb-2 flex h-[128px] items-center justify-center overflow-hidden rounded border border-line bg-pane-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={REAL_ASSET[m.key] ?? m.image} alt={`${m.vendor} ${m.name}`} className="h-full w-full object-contain" />
        </div>
        <div className="mb-1 grid grid-cols-2 gap-x-2 text-[10px] text-muted">
          <span>Power: <b className="text-text">{d.power}</b></span>
          <span>Health: <b className="text-text">{health}</b></span>
          <span>Links: <b className="text-text">{conn}</b></span>
          <span>Ports: <b className="text-text">{d.interfaces.length}</b></span>
        </div>
        <div className="max-h-[118px] overflow-hidden rounded bg-pane-2 px-1.5 py-1 font-mono text-[9px] leading-4 text-text/90">
          {d.interfaces.slice(0, 10).map((i) => <div key={i.name} className="flex justify-between gap-2"><span>{i.name}</span><span className={i.shutdown ? 'text-down' : i.type === 'console' || i.type === 'terminal' ? 'text-muted' : 'text-healthy'}>{i.shutdown ? 'shutdown' : i.ip ?? i.type}</span></div>)}
          {d.interfaces.length > 10 && <div className="text-muted">+{d.interfaces.length - 10} more interfaces</div>}
        </div>
      </div>
      <div className="w-full truncate text-[12px] leading-tight font-semibold">{d.name}</div>
      <div className="w-full truncate text-[10px] leading-tight text-muted">{m.vendor} {m.name}</div>
      <div className="w-full truncate font-mono text-[10px] leading-tight text-text/85">{ip ?? 'no IP'}{vlan !== undefined ? ` · V${vlan}` : ''}</div>
      {labels === 'full' && (
        <>
          <div className="w-full truncate font-mono text-[9.5px] leading-tight text-faint">{mac ?? 'MAC not reported'}</div>
          <div className="mt-0.5 flex w-full items-center justify-between text-[9.5px] text-muted">
            <span>{d.interfaces.filter((i) => i.type !== 'console' && i.type !== 'terminal' && !i.parent).length} ports</span>
            <span className={cx(linksTotal && linksUp < linksTotal ? 'text-degraded' : linksTotal ? 'text-healthy' : 'text-faint')}>{conn}</span>
          </div>
        </>
      )}
    </div>
  );
});

export type SiteFrameData = { label: string; sub?: string };
export function SiteFrame({ data }: NodeProps<Node<SiteFrameData>>) {
  return (
    <div className="pointer-events-none h-full w-full rounded-[12px] border border-dashed border-line-strong/70 bg-pane-2/15">
      <div className="px-3 py-1.5 text-[12px] text-muted">
        <span className="font-semibold text-text">{data.label}</span> {data.sub && <span className="font-mono text-[11px]">{data.sub}</span>}
      </div>
    </div>
  );
}

export type GroupFrameData = { label: string; members: string[] };
export function GroupFrame({ data }: NodeProps<Node<GroupFrameData>>) {
  return (
    <div className="h-full w-full rounded-[10px] border-2 border-dotted border-action/50 bg-action/5">
      <div className="inline-block cursor-pointer rounded-br-[6px] bg-action/15 px-2 py-0.5 text-[11px] font-medium text-action" title="Click to select the whole group">
        {data.label}
      </div>
    </div>
  );
}

// ---------------- cables ----------------

const STYLE: Record<Cable['type'], { color: string; width: number; dash?: string }> = {
  straight: { color: 'var(--cable-copper)', width: 2 },
  crossover: { color: 'var(--cable-copper)', width: 2, dash: '7 4' },
  access: { color: 'var(--cable-copper)', width: 2 },
  trunk: { color: '#a78bfa', width: 3.5 },
  fiber: { color: '#f59e0b', width: 2.5 },
  serial: { color: '#ef4444', width: 2, dash: '10 3 2 3' },
  console: { color: '#67e8f9', width: 1.6, dash: '2 3' },
  wan: { color: '#f472b6', width: 2.5, dash: '12 5' },
  virtual: { color: '#94a3b8', width: 1.8, dash: '3 4' },
};
export const CABLE_STYLE = STYLE;

const LIGHT: Record<CableStatus['state'], string> = { up: '#2fb36a', degraded: '#e5a23a', down: '#e5484d', disabled: '#6b7c8f' };
export const CABLE_ASSET: Partial<Record<Cable['type'] | 'auto', string>> = {
  auto: '/lab/generated/cables/cat6-ethernet-blue.png',
  straight: '/lab/generated/cables/cat6-ethernet-blue.png',
  crossover: '/lab/generated/cables/ethernet-crossover-orange.png',
  access: '/lab/generated/cables/ethernet-access-green.png',
  trunk: '/lab/generated/cables/ethernet-trunk-purple.png',
  fiber: '/lab/generated/cables/fiber-lc-aqua.png',
  console: '/lab/generated/cables/console-rollover-rj45-db9.png',
  serial: '/lab/generated/cables/serial-dce-dte-red.png',
  wan: '/lab/generated/cables/wan-circuit-black.png',
  virtual: '/lab/generated/cables/virtual-wireless-blue.png',
};

function center(n: ReturnType<typeof useInternalNode>) {
  const w = n?.measured.width ?? DEVICE_W;
  const h = n?.measured.height ?? DEVICE_H;
  const p = n?.internals.positionAbsolute ?? { x: 0, y: 0 };
  return { x: p.x + w / 2, y: p.y + h / 2, w, h };
}

/** Point where the line from the node centre towards `to` leaves the node's box. */
function border(c: { x: number; y: number; w: number; h: number }, to: { x: number; y: number }) {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return { x: c.x, y: c.y };
  const sx = (c.w / 2 + 4) / Math.abs(dx || 1e-9);
  const sy = (c.h / 2 + 4) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const along = (p: { x: number; y: number }, q: { x: number; y: number }, d: number) => {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + ((q.x - p.x) / len) * d, y: p.y + ((q.y - p.y) / len) * d };
};

export function CableEdge({ id, source, target, data, selected }: EdgeProps<Edge<CableEdgeData>>) {
  const sn = useInternalNode(source);
  const tn = useInternalNode(target);
  if (!sn || !tn || !data) return null;
  const { cable, status, portLabels, flow, compare, ghost, onPath } = data;
  const A = center(sn);
  const B = center(tn);
  const bend = cable.bend;
  const a = border(A, bend ?? B);
  const b = border(B, bend ?? A);
  let path: string;
  let mid: { x: number; y: number };
  if (bend) {
    const cx2 = 2 * bend.x - (a.x + b.x) / 2;
    const cy2 = 2 * bend.y - (a.y + b.y) / 2;
    path = `M ${a.x} ${a.y} Q ${cx2} ${cy2} ${b.x} ${b.y}`;
    mid = bend;
  } else {
    path = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const st = STYLE[cable.type];
  const err = status.issues.some((i) => i.severity === 'error');
  const color = ghost ? 'var(--down)' : err ? 'var(--down)' : st.color;
  const la = along(a, bend ?? b, 9);
  const lb = along(b, bend ?? a, 9);
  const ta = along(a, bend ?? b, 30);
  const tb = along(b, bend ?? a, 30);
  const light = LIGHT[status.state];
  const blk = data.blocked ?? [];
  const lightA = blk.includes('a') ? LIGHT.degraded : light;
  const lightB = blk.includes('b') ? LIGHT.degraded : light;
  const cond = cable.cond?.enabled ? cable.cond : undefined;
  const live = !!flow && flow.bytes_per_s > 0 && status.state !== 'down' && status.state !== 'disabled';
  const [hover, setHover] = useState(false);
  const dur = flow ? Math.max(0.6, 2.6 - Math.log10(Math.max(10, flow.bytes_per_s)) * 0.3) : 2;
  const title = `${CABLE_LABEL[cable.type]}${cable.label ? ` (${cable.label})` : ''}: ${status.state}${status.negotiated ? `, ${status.negotiated}` : ''}${status.issues.filter((i) => i.severity !== 'info').map((i) => `\n- ${i.message}`).join('')}`;
  return (
    <>
      {(selected || onPath) && <path d={path} fill="none" stroke="var(--action)" strokeWidth={st.width + 7} opacity={selected ? 0.35 : 0.2} />}
      {compare && <path d={path} fill="none" stroke={compare === 'added' ? 'var(--healthy)' : compare === 'changed' ? 'var(--degraded)' : 'var(--down)'} strokeWidth={st.width + 6} opacity={0.35} />}
      <BaseEdge id={id} path={path} interactionWidth={16} style={{ stroke: color, strokeWidth: st.width, strokeDasharray: ghost ? '4 4' : err ? '6 4' : st.dash, opacity: status.state === 'disabled' ? 0.45 : 1 }} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} className="nodrag nopan" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
      <title>{title}</title>
      {live && (
        <g aria-hidden>
          {[0, 0.33, 0.66].map((off) =>
            flow!.denied > 0 && off === 0.66 ? (
              <circle key={off} r={3} fill="var(--down)">
                <animateMotion dur={`${dur}s`} begin={`${off * dur}s`} repeatCount="indefinite" keyPoints="0;0.48" keyTimes="0;1" calcMode="linear" path={path} />
              </circle>
            ) : (
              <circle key={off} r={2.6} fill="var(--action)" opacity={0.9}>
                <animateMotion dur={`${dur}s`} begin={`${off * dur}s`} repeatCount="indefinite" path={path} />
              </circle>
            ),
          )}
        </g>
      )}
      <circle cx={la.x} cy={la.y} r={3.6} fill={lightA} stroke="var(--pane)" strokeWidth={1} />
      <circle cx={lb.x} cy={lb.y} r={3.6} fill={lightB} stroke="var(--pane)" strokeWidth={1} />
      {data.channel && <ellipse cx={mid.x} cy={mid.y} rx={9} ry={14} fill="none" stroke={data.channel.ok ? 'var(--action)' : 'var(--down)'} strokeWidth={1.6} transform={`rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI} ${mid.x} ${mid.y})`} />}
      <EdgeLabelRenderer>
        {hover && !ghost && (
          <div className="nodrag nopan pointer-events-none absolute z-50 w-[320px] -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-pane p-2 text-left text-[11px] shadow-xl" style={{ transform: `translate(-50%, -100%) translate(${mid.x}px, ${mid.y - 12}px)` }} data-testid="cable-hover-card">
            <div className="mb-1 flex items-center gap-2">
              {CABLE_ASSET[cable.type] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={CABLE_ASSET[cable.type]} alt="" className="h-16 w-28 rounded bg-white/95 object-contain" />
              ) : <span className="h-10 w-14 rounded bg-pane-2" />}
              <div><b className="block">{CABLE_LABEL[cable.type]}</b><span className="text-muted">{status.state}{status.negotiated ? ` · ${status.negotiated}` : ''}</span></div>
            </div>
            <div className="font-mono text-[10px] text-text/90">{cable.a.port} → {cable.b.port}</div>
            <div className="mt-1 text-muted">{cable.lengthM ? `${cable.lengthM} m` : 'Length not set'}{cable.label ? ` · ${cable.label}` : ''}</div>
            {status.issues.filter((i) => i.severity !== 'info').map((i) => <div key={i.code} className={i.severity === 'error' ? 'text-down' : 'text-degraded'}>{i.message}</div>)}
          </div>
        )}
        {portLabels && (
          <>
            <div className="nodrag nopan pointer-events-none absolute rounded bg-pane/90 px-1 font-mono text-[9.5px] text-muted" style={{ transform: `translate(-50%, -50%) translate(${ta.x}px, ${ta.y}px)` }} data-testid={`port-label-${cable.a.port}`}>
              {cable.a.port}
            </div>
            <div className="nodrag nopan pointer-events-none absolute rounded bg-pane/90 px-1 font-mono text-[9.5px] text-muted" style={{ transform: `translate(-50%, -50%) translate(${tb.x}px, ${tb.y}px)` }}>
              {cable.b.port}
            </div>
          </>
        )}
        {blk.map((end) => {
          const p = along(end === 'a' ? a : b, end === 'a' ? (bend ?? b) : (bend ?? a), 18);
          return (
            <div key={end} className="nodrag nopan pointer-events-none absolute rounded bg-degraded px-1 font-mono text-[9px] font-semibold text-black" style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y - 11}px)` }} data-testid="stp-blk" title="Spanning tree is blocking this port to prevent a loop">
              BLK
            </div>
          );
        })}
        {data.channel && (
          <div className="nodrag nopan pointer-events-none absolute rounded bg-pane px-1 font-mono text-[9px]" style={{ transform: `translate(-50%, 60%) translate(${mid.x}px, ${mid.y}px)`, color: data.channel.ok ? 'var(--action)' : 'var(--down)' }}>
            Po{data.channel.group}
            {data.channel.ok ? '' : ' ⚠'}
          </div>
        )}
        {cond && (
          <div className="nodrag nopan pointer-events-none absolute rounded border border-degraded/60 bg-pane px-1 font-mono text-[9px] text-degraded" style={{ transform: `translate(-50%, 160%) translate(${mid.x}px, ${mid.y}px)` }} title="Link conditioning is on">
            {[cond.latencyMs ? `${cond.latencyMs}ms` : '', cond.jitterMs ? `±${cond.jitterMs}` : '', cond.lossPct ? `${cond.lossPct}% loss` : '', cond.bandwidthMbps ? `${cond.bandwidthMbps}M` : ''].filter(Boolean).join(' ')}
          </div>
        )}
        {(err || status.state === 'down' || flow?.denied || selected || status.state === 'degraded') && (
          <div className="nodrag nopan pointer-events-none absolute rounded border border-line bg-pane px-1 py-px font-mono text-[9.5px]" style={{ transform: `translate(-50%, -140%) translate(${mid.x}px, ${mid.y}px)` }}>
            {err ? <span className="text-down">⚠ invalid</span> : status.state === 'down' ? <span className="text-down">link down</span> : status.state === 'degraded' ? <span className="text-degraded">⚠ {status.issues.find((i) => i.severity === 'degraded')?.code.replace(/_/g, ' ')}</span> : status.state === 'disabled' ? <span className="text-muted">disabled</span> : <span className="text-muted">{CABLE_LABEL[cable.type]}</span>}
            {flow && flow.bytes_per_s > 0 && <span className="text-muted"> · {fmtBytes(flow.bytes_per_s)}</span>}
            {flow?.denied ? <span className="text-down"> · {flow.denied} blocked</span> : null}
          </div>
        )}
        {selected && !ghost && (
          <>
            {(['a', 'b'] as const).map((end) => {
              const p = end === 'a' ? a : b;
              return (
                <button
                  key={end}
                  type="button"
                  aria-label={`Drag to reconnect the ${end === 'a' ? 'first' : 'second'} end (${end === 'a' ? cable.a.port : cable.b.port})`}
                  title="Drag onto another device to reconnect this end"
                  onPointerDown={(e) => data.onEndPointerDown?.(cable.id, end, e)}
                  className="nodrag nopan pointer-events-auto absolute size-3.5 cursor-grab rounded-[3px] border-2 border-action bg-pane"
                  style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
                />
              );
            })}
            <button
              type="button"
              aria-label="Drag to move the cable. Double-click to straighten it."
              title="Drag to route the cable. Double-click to straighten."
              onPointerDown={(e) => data.onBendPointerDown?.(cable.id, e)}
              onDoubleClick={() => data.onBendReset?.(cable.id)}
              className="nodrag nopan pointer-events-auto absolute size-3.5 cursor-move rounded-full border-2 border-action bg-action/30"
              style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
            />
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

// ---------------- annotations ----------------

const NOTE_COLOR: Record<Annotation['color'], string> = { blue: '#3b8ee8', green: '#2fb36a', amber: '#e5a23a', red: '#e5484d', grey: '#8a9bb0' };
export type NoteNodeData = { note: Annotation };

/** Free text, rectangles and ellipses drawn on the canvas (zones, labels, instructions). */
export const NoteNode = memo(function NoteNode({ data, selected }: NodeProps<Node<NoteNodeData>>) {
  const n = data.note;
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(n.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setText(n.text), [n.text]);
  // Double-click: React Flow focuses the node on mousedown, so we enter edit mode on the second
  // click's 'click' event (after focus has settled) instead of on dblclick, which the canvas swallows.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: MouseEvent) => {
      if (e.detail >= 2) setEdit(true);
    };
    el.addEventListener('click', on);
    return () => el.removeEventListener('click', on);
  }, []);
  useEffect(() => {
    if (edit) ref.current?.focus();
  }, [edit]);
  const c = NOTE_COLOR[n.color];
  const st = useLab.getState;
  return (
    <div
      ref={box}
      className="h-full w-full"
      data-testid={`note-${n.id}`}
      style={{
        border: `2px ${n.kind === 'text' ? 'solid' : 'dashed'} ${c}`,
        borderRadius: n.kind === 'ellipse' ? '50%' : 8,
        background: n.kind === 'text' ? `${c}22` : `${c}0d`,
      }}
    >
      <NodeResizer isVisible={selected} minWidth={80} minHeight={40} color={c} onResizeEnd={(_e, p) => st().updateAnnotation(n.id, { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) })} />
      {edit ? (
        <textarea
          ref={ref}
          aria-label="Note text"
          className="nodrag h-full w-full resize-none bg-transparent p-2 text-[12.5px] outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEdit(false);
            if (text !== n.text) st().updateAnnotation(n.id, { text });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            e.stopPropagation();
          }}
        />
      ) : (
        <div className={cx('h-full w-full overflow-hidden whitespace-pre-wrap p-2 text-[12.5px]', n.kind !== 'text' && 'text-[12px] font-semibold')} style={{ color: n.kind === 'text' ? undefined : c }}>
          {n.text}
        </div>
      )}
      {selected && !edit && (
        <div className="nodrag absolute -top-8 left-0 flex gap-1 rounded border border-line bg-pane p-0.5 shadow">
          {(Object.keys(NOTE_COLOR) as Annotation['color'][]).map((k) => (
            <button key={k} aria-label={`Colour ${k}`} className="size-4 rounded-full" style={{ background: NOTE_COLOR[k] }} onClick={() => st().updateAnnotation(n.id, { color: k })} />
          ))}
          {(['text', 'rect', 'ellipse'] as const).map((k) => (
            <button key={k} className={cx('rounded px-1 text-[10px]', n.kind === k ? 'bg-action/20' : 'text-muted')} onClick={() => st().updateAnnotation(n.id, { kind: k })}>
              {k === 'text' ? 'Note' : k === 'rect' ? 'Box' : 'Oval'}
            </button>
          ))}
          <button className="rounded px-1 text-[10px]" onClick={() => setEdit(true)} data-testid="note-edit">
            Edit text
          </button>
          <button className="rounded px-1 text-[10px] text-down" onClick={() => st().removeAnnotation(n.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
});
