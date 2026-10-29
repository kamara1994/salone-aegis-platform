'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAlerts, useClients, useControls, useNotifications, useScorecards, useSettings, useTickets, useTopology } from '@/api/hooks';
import { DockLayout, resetLayout } from '@/components/dock/DockLayout';
import { EdgePanel } from '@/components/map/EdgePanel';
import { NodePanel } from '@/components/map/NodePanel';
import { MapLegend, TopologyMap } from '@/components/map/TopologyMap';
import { useRuntime } from '@/components/providers';
import { OPEN, TicketQueue } from '@/components/tickets/TicketQueue';
import { Badge, Button, EmptyState, fmtDuration, HealthDot, PriorityBadge, QueryView, relTime, useNow } from '@/components/ui';
import { useUi } from '@/state/ui';
import { CertStrip } from '@/components/cert/CertStrip';

function ShiftPanel() {
  const { mock } = useRuntime();
  const clients = useClients();
  const open = useTickets({ status: OPEN });
  const score = useScorecards();
  const controls = useControls();
  const settings = useSettings();
  const toast = useUi((s) => s.toast);
  const now = useNow(1000);
  const byP = (p: string) => open.data?.items.filter((t) => t.priority === p).length ?? 0;
  const breached = open.data?.items.filter((t) => t.sla_breached).length ?? 0;
  const failing = controls.data?.filter((c) => !c.passed) ?? [];
  return (
    <div className="space-y-4 p-3 text-[13px]">
      <section>
        <h3 className="mb-2 text-[12.5px] font-semibold">Open work</h3>
        <div className="flex flex-wrap gap-2">
          {(['P1', 'P2', 'P3', 'P4'] as const).map((p) => (
            <div key={p} className="flex items-center gap-1.5 rounded border border-line px-2 py-1">
              <PriorityBadge p={p} />
              <span className="tabular-nums font-semibold">{byP(p)}</span>
            </div>
          ))}
          {breached > 0 && <Badge tone="bad">{breached} past SLA</Badge>}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-[12.5px] font-semibold">Clients</h3>
        <QueryView q={clients}>
          {(cs) => (
            <ul className="space-y-1.5">
              {cs.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <HealthDot h={c.health_summary.down ? 'down' : c.health_summary.degraded ? 'degraded' : 'healthy'} />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted">{c.sector.replace('_', ' ')}</span>
                  <span className="ml-auto text-[12px] text-muted">
                    {c.health_summary.healthy} ok · {c.health_summary.degraded} degraded · {c.health_summary.down} down
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </section>
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded border border-line p-2">
          <p className="text-[12px] text-muted">SLA met</p>
          <p className="text-[20px] font-semibold tabular-nums">{score.data?.operator.sla_met_pct ?? '-'}%</p>
        </div>
        <div className="rounded border border-line p-2">
          <p className="text-[12px] text-muted">Mean time to resolve</p>
          <p className="text-[20px] font-semibold tabular-nums">{score.data?.operator.mttr_minutes ?? '-'}m</p>
        </div>
        <div className="rounded border border-line p-2">
          <p className="text-[12px] text-muted">Controls passing</p>
          <p className="text-[20px] font-semibold tabular-nums">{score.data?.control.pass_pct ?? '-'}%</p>
        </div>
      </section>
      {failing.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[12.5px] font-semibold text-down">Controls failing now</h3>
          <ul className="space-y-1">
            {failing.map((c) => (
              <li key={c.id} className="text-[12.5px]">
                <Link href="/evidence?tab=controls" className="hover:underline">
                  {c.id} {c.control}
                </Link>
                <span className="text-muted">: {c.evidence}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mock && settings.data && (
        <section className="flex items-center gap-2 rounded border border-line p-2">
          <span className="text-muted">{settings.data.schedule.enabled ? `Next scheduled ticket in ${fmtDuration(Math.max(0, mock.nextLaunchAt() - now))}` : 'The scheduler is paused (Settings).'}</span>
          <Button size="sm" className="ml-auto" onClick={() => { mock.triggerNow(); toast({ tone: 'info', title: 'Asked the scheduler for the next ticket' }); }}>
            Send one now
          </Button>
        </section>
      )}
    </div>
  );
}

function FeedPanel() {
  const q = useNotifications();
  const sel = useUi((s) => s.clientId);
  const now = useNow(30_000);
  return (
    <QueryView q={q} empty={(d) => (d.items.length ? false : <EmptyState title="No activity yet" />)}>
      {(d) => (
        <ul className="divide-y divide-line">
          {d.items
            .filter((n) => sel === 'all' || n.client_id === sel)
            .slice(0, 30)
            .map((n) => (
              <li key={n.id} className="px-3 py-2 text-[13px]">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <PriorityBadge p={n.severity} />
                  <span>{n.kind.replace('_', ' ')}</span>
                  <span className="ml-auto">{relTime(n.created_at, now)}</span>
                </div>
                <p className="mt-1 font-medium">{n.ticket_id ? <Link className="hover:underline" href={`/tickets/${n.ticket_id}`}>{n.title}</Link> : n.title}</p>
              </li>
            ))}
        </ul>
      )}
    </QueryView>
  );
}

function AlertsMini() {
  const q = useAlerts();
  return (
    <QueryView q={q} empty={(d) => (d.items.some((a) => a.state !== 'classified') ? false : <EmptyState title="SOC queue clear" />)}>
      {(d) => (
        <ul className="divide-y divide-line">
          {d.items
            .filter((a) => a.state !== 'classified')
            .map((a) => (
              <li key={a.id}>
                <Link href={`/soc?alert=${a.id}`} className="block px-3 py-2 text-[13px] hover:bg-pane-2">
                  <div className="flex items-center gap-2">
                    <PriorityBadge p={a.severity} />
                    <span className="truncate font-medium">{a.rule}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {a.attack_technique} · {a.state}
                  </p>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </QueryView>
  );
}

export default function CockpitPage() {
  const topo = useTopology();
  const [sel, setSel] = useState<{ node?: string; edge?: string }>({});
  const [version, setVersion] = useState(0);
  const panels = useMemo(
    () => ({
      map: {
        title: 'Live topology map',
        render: () => (
          <div className="flex h-full flex-col">
            <div className="border-b border-line px-3 py-1.5">
              <MapLegend />
            </div>
            <div className="min-h-0 flex-1">
              <QueryView q={topo} rows={6}>
                {(t) => <TopologyMap topo={t} selectedEdge={sel.edge} onNodeClick={(n) => setSel({ node: n.id })} onEdgeClick={(e) => setSel({ edge: e })} />}
              </QueryView>
            </div>
          </div>
        ),
      },
      queue: { title: 'Ticket queue', render: () => <TicketQueue compact /> },
      inspect: {
        title: 'Inspector',
        render: () => (sel.node ? <NodePanel nodeId={sel.node} /> : sel.edge ? <EdgePanel edgeId={sel.edge} /> : <EmptyState title="Select something on the map" body="Click a node to see its health, tickets and actions, or an edge to see its flows and packets." />),
      },
      shift: { title: 'Shift', render: () => <ShiftPanel /> },
      feed: { title: 'Activity', render: () => <FeedPanel /> },
      alerts: { title: 'SOC queue', render: () => <AlertsMini /> },
    }),
    [topo, sel],
  );
  return (
    <div className="flex h-full flex-col">
      <CertStrip />
      <div className="flex items-center justify-between px-3 pt-2 text-[12.5px] text-muted">
        <span>Drag tabs to rearrange panels. Your layout is saved.</span>
        <button
          className="hover:text-text"
          onClick={() => {
            resetLayout('cockpit');
            setVersion((v) => v + 1);
          }}
        >
          Reset layout
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DockLayout
          key={version}
          storageKey="cockpit"
          panels={panels}
          buildDefault={(add) => {
            add('map');
            add('queue', { ref: 'map', dir: 'right', size: 380 });
            add('alerts', { ref: 'queue', dir: 'within' });
            add('inspect', { ref: 'queue', dir: 'below' });
            add('shift', { ref: 'map', dir: 'below', size: 250 });
            add('feed', { ref: 'shift', dir: 'right' });
          }}
        />
      </div>
    </div>
  );
}
