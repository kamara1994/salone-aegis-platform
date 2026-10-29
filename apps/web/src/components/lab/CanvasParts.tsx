'use client';

import { BaseEdge, EdgeLabelRenderer, Handle, Position, useInternalNode, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { KIND_LABEL, modelOf } from '@/lab/catalog';
import { DEVICE_H, DEVICE_W } from '@/lab/inventory';
import { primaryIp } from '@/lab/simulate';
import type { Cable, CableStatus, Device } from '@/lab/types';
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
};

export type CableEdgeData = {
  cable: Cable;
  status: CableStatus;
  portLabels: boolean;
  flow?: { bytes_per_s: number; allowed: number; denied: number; top_app?: string };
  compare?: CompareMark;
  ghost?: boolean;
  onPath: boolean;
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
  const { device: d, linksUp, linksTotal, compare, labels, connectable, pending, onPath, ghost } = data;
  const m = modelOf(d);
  const off = d.power === 'stopped';
  const health = off ? 'down' : d.health;
  const ip = primaryIp(d);
  const vlan = primaryVlan(d);
  const mac = primaryMac(d);
  const conn = linksTotal === 0 ? 'not connected' : `${linksUp}/${linksTotal} up`;
  return (
    <div
      data-device-id={d.id}
      data-testid={`lab-device-${d.name}`}
      aria-label={`${d.name}, ${KIND_LABEL[d.kind]}, ${health}, ${conn}`}
      title={deviceSummary(d, linksUp, linksTotal)}
      className={cx(
        'group relative flex flex-col items-center rounded-[8px] border bg-pane/95 px-1.5 pt-1 pb-1.5 text-center shadow-sm',
        selected ? 'border-action ring-2 ring-action/40' : pending ? 'border-action border-dashed' : onPath ? 'border-action/70' : 'border-line-strong',
        compare === 'added' && 'ring-2 ring-healthy/70',
        compare === 'changed' && 'ring-2 ring-degraded/80',
        ghost && 'border-dashed border-down/70 opacity-55',
      )}
      style={{ width: DEVICE_W, minHeight: labels === 'full' ? DEVICE_H : 78 }}
    >
      <Handle type="source" position={Position.Top} id="c" isConnectable={connectable} className={cx('!absolute !inset-0 !h-full !w-full !translate-0 !rounded-[8px] !border-0 !bg-transparent', connectable ? '!cursor-crosshair' : '!pointer-events-none')} />
      {compare && <span className={cx('absolute -top-2 left-1 rounded px-1 text-[9.5px] font-semibold text-white', compare === 'added' ? 'bg-healthy' : compare === 'changed' ? 'bg-degraded' : 'bg-down')}>{compare === 'added' ? 'New' : compare === 'changed' ? 'Changed' : 'Removed'}</span>}
      {d.origin === 'design' && !compare && <span className="absolute -top-2 left-1 rounded border border-line-strong bg-pane px-1 text-[9.5px] text-muted">Design</span>}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.image} alt="" draggable={false} className={cx('pointer-events-none h-[46px] w-[70px] select-none object-contain', off && 'grayscale opacity-60')} />
        <span className={cx('absolute top-0.5 -left-1.5 size-2.5 rounded-full border border-pane', off ? 'bg-down' : d.power === 'running' ? 'bg-healthy' : 'bg-faint')} title={`Power ${d.power}`} aria-hidden />
        <span className={cx('absolute top-0.5 -right-1.5 size-2.5 rounded-full border border-pane', health === 'healthy' ? 'bg-healthy' : health === 'degraded' ? 'bg-degraded' : health === 'down' ? 'bg-down' : 'bg-faint')} title={`Health ${health}`} aria-hidden />
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
  const live = !!flow && flow.bytes_per_s > 0 && status.state !== 'down' && status.state !== 'disabled';
  const dur = flow ? Math.max(0.6, 2.6 - Math.log10(Math.max(10, flow.bytes_per_s)) * 0.3) : 2;
  const title = `${CABLE_LABEL[cable.type]}${cable.label ? ` (${cable.label})` : ''}: ${status.state}${status.negotiated ? `, ${status.negotiated}` : ''}${status.issues.filter((i) => i.severity !== 'info').map((i) => `\n- ${i.message}`).join('')}`;
  return (
    <>
      {(selected || onPath) && <path d={path} fill="none" stroke="var(--action)" strokeWidth={st.width + 7} opacity={selected ? 0.35 : 0.2} />}
      {compare && <path d={path} fill="none" stroke={compare === 'added' ? 'var(--healthy)' : compare === 'changed' ? 'var(--degraded)' : 'var(--down)'} strokeWidth={st.width + 6} opacity={0.35} />}
      <BaseEdge id={id} path={path} interactionWidth={16} style={{ stroke: color, strokeWidth: st.width, strokeDasharray: ghost ? '4 4' : err ? '6 4' : st.dash, opacity: status.state === 'disabled' ? 0.45 : 1 }} />
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
      <circle cx={la.x} cy={la.y} r={3.6} fill={light} stroke="var(--pane)" strokeWidth={1} />
      <circle cx={lb.x} cy={lb.y} r={3.6} fill={light} stroke="var(--pane)" strokeWidth={1} />
      <EdgeLabelRenderer>
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
