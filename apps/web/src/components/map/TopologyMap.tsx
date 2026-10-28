'use client';

import { Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type EdgeProps, type Node as RFNode, type NodeProps } from '@xyflow/react';
import { Cloud, Monitor, Router, Server, Shield, Waypoints } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useAlerts, useTickets } from '@/api/hooks';
import type { Node, Topology } from '@/api/types';
import { cx, fmtBytes } from '@/components/ui';
import { useLive } from '@/state/ui';

type NodeData = { n: Node; tickets: number; alerts: number; highlight: boolean; dim: boolean; compact: boolean };
type SiteData = { label: string; cidr: string };
type EdgeData = { bytes: number; denied: number; app?: string; state: string; selected: boolean; label?: string };

const ICON = { vm: Server, router: Router, switch: Waypoints, firewall: Shield, cloud_resource: Cloud, container: Server } as const;

const HostNode = memo(function HostNode({ data }: NodeProps<RFNode<NodeData>>) {
  const { n, tickets, alerts, highlight, dim, compact } = data;
  const Icon = n.name.startsWith('WS-') || n.name.startsWith('KL-WS') ? Monitor : ICON[n.kind] ?? Server;
  const off = n.power === 'stopped';
  const ring = off || n.health === 'down' ? 'border-down' : n.health === 'degraded' ? 'border-degraded' : highlight ? 'border-action' : 'border-line-strong';
  return (
    <div className={cx('relative rounded-[6px] border bg-pane px-2.5 py-1.5 text-left transition-opacity', ring, highlight && 'outline-2 outline-offset-2 outline-action/50', dim && 'opacity-40', compact ? 'w-[124px]' : 'w-[150px]')} data-testid={`map-node-${n.name}`}>
      <Handle type="target" position={Position.Top} className="!size-1 !border-0 !bg-transparent" />
      <div className="flex items-center gap-1.5">
        <Icon className={cx('size-3.5 shrink-0', off || n.health === 'down' ? 'text-down' : n.health === 'degraded' ? 'text-degraded' : 'text-muted')} aria-hidden />
        <span className="truncate text-[12.5px] font-semibold">{n.name}</span>
        <span className={cx('ml-auto size-2 shrink-0 rounded-full', off || n.health === 'down' ? 'bg-down' : n.health === 'degraded' ? 'bg-degraded' : 'bg-healthy')} aria-label={off ? 'powered off' : n.health} />
      </div>
      {!compact && <div className="mt-0.5 truncate text-[11px] text-muted">{n.role}</div>}
      <div className="truncate font-mono text-[10.5px] text-faint">{off ? 'powered off' : n.mgmt_ip}</div>
      {(tickets > 0 || alerts > 0) && (
        <div className="absolute -top-2 -right-2 flex gap-0.5">
          {tickets > 0 && <span className="rounded-full bg-action px-1.5 text-[10px] leading-4 font-semibold text-white" title={`${tickets} open ticket(s)`}>{tickets}</span>}
          {alerts > 0 && <span className="rounded-full bg-p1 px-1.5 text-[10px] leading-4 font-semibold text-white" title={`${alerts} open alert(s)`}>!</span>}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!size-1 !border-0 !bg-transparent" />
    </div>
  );
});

function SiteNode({ data }: NodeProps<RFNode<SiteData>>) {
  return (
    <div className="h-full w-full rounded-[10px] border border-dashed border-line-strong/70 bg-pane-2/20">
      <div className="px-3 py-1.5 text-[12px] text-muted">
        <span className="font-semibold text-text">{data.label}</span> <span className="font-mono text-[11px]">{data.cidr}</span>
      </div>
    </div>
  );
}

function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<EdgeData>>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const d = data!;
  const width = d.state === 'down' ? 1.5 : Math.max(1.2, Math.min(6, Math.log10(Math.max(10, d.bytes)) - 2.4));
  const color = d.state === 'down' ? 'var(--down)' : d.state === 'degraded' ? 'var(--degraded)' : d.bytes > 0 ? 'var(--action)' : 'var(--line-strong)';
  return (
    <>
      <BaseEdge id={id} path={path} className={cx(d.bytes > 0 && d.state !== 'down' && 'flowing')} style={{ stroke: color, strokeWidth: width, opacity: d.bytes > 0 || d.state !== 'up' ? 1 : 0.55 }} />
      {d.denied > 0 && <path d={path} fill="none" className="react-flow__edge-path denied" style={{ stroke: 'var(--down)', strokeWidth: 1.5 }} transform="translate(0,4)" />}
      {(d.selected || d.denied > 0 || d.state !== 'up') && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%, -50%) translate(${lx}px,${ly}px)` }} className="pointer-events-none absolute rounded border border-line bg-pane px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
            {d.state === 'down' ? 'link down' : `${fmtBytes(d.bytes)}${d.app ? ` ${d.app}` : ''}`}
            {d.denied > 0 && <span className="text-down"> · {d.denied} blocked</span>}
            {d.state === 'degraded' && <span className="text-degraded"> · errors</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { host: HostNode, site: SiteNode };
const edgeTypes = { flow: FlowEdge };

function pos(n: Node): { x: number; y: number } {
  const x = Number(n.tags?.find((t) => t.startsWith('x:'))?.slice(2));
  const y = Number(n.tags?.find((t) => t.startsWith('y:'))?.slice(2));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

export interface TopologyMapProps {
  topo: Topology;
  highlight?: string[];
  focusOnly?: boolean;
  selectedEdge?: string | null;
  compact?: boolean;
  onNodeClick?: (n: Node) => void;
  onEdgeClick?: (edgeId: string) => void;
  /** Frozen flows for replay; otherwise live flow.batch data is used. */
  flowsOverride?: Record<string, { bytes_per_s: number; allowed: number; denied: number; top_app?: string }>;
}

function MapInner({ topo, highlight = [], focusOnly, selectedEdge, compact, onNodeClick, onEdgeClick, flowsOverride }: TopologyMapProps) {
  const liveFlows = useLive((s) => s.flows);
  const flows = flowsOverride ?? liveFlows;
  const tickets = useTickets({ status: ['new', 'acknowledged', 'investigating', 'pending_verification', 'client_explanation', 'debrief'] });
  const alerts = useAlerts();

  const { nodes, edges } = useMemo(() => {
    const clientIds = [...new Set(topo.nodes.map((n) => n.client_id))];
    // Stack clients top to bottom with a gap, based on each client's real height, so the map stays close to the panel's shape.
    const offsets: Record<string, number> = {};
    let cursor = 0;
    for (const cid of clientIds) {
      offsets[cid] = cursor;
      const ys = topo.nodes.filter((n) => n.client_id === cid).map((n) => pos(n).y);
      cursor += Math.max(...ys, 0) + 260;
    }
    const shiftY = (cid: string) => offsets[cid] ?? 0;
    const hl = new Set(highlight);
    const counts: Record<string, number> = {};
    for (const t of tickets.data?.items ?? []) for (const id of t.affected_node_ids ?? []) counts[id] = (counts[id] ?? 0) + 1;
    const alertCount: Record<string, number> = {};
    for (const a of alerts.data?.items ?? []) if (a.state !== 'classified' && a.node_id) alertCount[a.node_id] = (alertCount[a.node_id] ?? 0) + 1;
    const visible = focusOnly && hl.size ? topo.nodes.filter((n) => hl.has(n.id) || topo.links.some((l) => (l.a_node_id === n.id && hl.has(l.b_node_id)) || (l.b_node_id === n.id && hl.has(l.a_node_id)))) : topo.nodes;
    const W = compact ? 124 : 150;
    const H = compact ? 46 : 60;
    const hostNodes: RFNode[] = visible.map((n) => {
      const p = pos(n);
      return { id: n.id, type: 'host', position: { x: p.x, y: p.y + 40 + shiftY(n.client_id) }, data: { n, tickets: counts[n.id] ?? 0, alerts: alertCount[n.id] ?? 0, highlight: hl.has(n.id), dim: hl.size > 0 && !hl.has(n.id) && !focusOnly, compact: !!compact }, draggable: true };
    });
    const siteNodes: RFNode[] = topo.sites
      .map((s) => {
        const members = hostNodes.filter((h) => (h.data as NodeData).n.site_id === s.id);
        if (!members.length) return null;
        const xs = members.map((m) => m.position.x);
        const ys = members.map((m) => m.position.y);
        const x0 = Math.min(...xs) - 24;
        const y0 = Math.min(...ys) - 44;
        return { id: `site:${s.id}`, type: 'site', position: { x: x0, y: y0 }, data: { label: s.name, cidr: s.cidr }, style: { width: Math.max(...xs) - x0 + W + 24, height: Math.max(...ys) - y0 + H + 24 }, draggable: false, selectable: false, zIndex: -1 } as RFNode;
      })
      .filter(Boolean) as RFNode[];
    const ids = new Set(hostNodes.map((n) => n.id));
    const es: Edge[] = topo.links
      .filter((l) => ids.has(l.a_node_id) && ids.has(l.b_node_id))
      .map((l) => {
        const f = flows[l.id];
        return { id: l.id, source: l.a_node_id, target: l.b_node_id, type: 'flow', data: { bytes: f?.bytes_per_s ?? 0, denied: f?.denied ?? 0, app: f?.top_app, state: l.state, selected: selectedEdge === l.id, label: l.label }, interactionWidth: 18 };
      });
    return { nodes: [...siteNodes, ...hostNodes], edges: es };
  }, [topo, highlight, focusOnly, selectedEdge, compact, flows, tickets.data, alerts.data]);

  // Refit when the panel is resized (dock drags, first layout), so the map never sits tiny in a corner.
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => void rf.fitView({ padding: 0.08, maxZoom: 1.1, duration: 0 }), 120);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [rf]);

  return (
    <div ref={box} className="h-full w-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.08, maxZoom: 1.1 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => n.type === 'host' && onNodeClick?.((n.data as NodeData).n)}
      onEdgeClick={(_, e) => onEdgeClick?.(e.id)}
      nodesConnectable={false}
      aria-label="Live topology map"
    >
      <Background gap={24} size={1} color="var(--line)" />
      <Controls showInteractive={false} />
    </ReactFlow>
    </div>
  );
}

export function TopologyMap(p: TopologyMapProps) {
  return (
    <ReactFlowProvider>
      <MapInner {...p} />
    </ReactFlowProvider>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 bg-action" /> traffic (thicker = more)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 border-t-2 border-dashed border-down" /> blocked by firewall
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-degraded" /> degraded
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-down" /> down or off
      </span>
      <span>Click a node for detail, an edge for its flows and packets.</span>
    </div>
  );
}
