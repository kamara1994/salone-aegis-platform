'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useControls, useDebrief, useScorecards, useTicket, useTickets } from '@/api/hooks';
import { LineChart } from '@/components/charts/LineChart';
import { EvidenceList } from '@/components/tickets/TicketParts';
import { Badge, Button, cx, EmptyState, Pane, PriorityBadge, QueryView, Tabs } from '@/components/ui';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[6px] border border-line bg-pane p-3">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-[12px] text-faint">{note}</p>}
    </div>
  );
}

function Scorecards() {
  const q = useScorecards();
  return (
    <QueryView q={q} rows={6}>
      {(s) => {
        const labels = s.operator.trend?.map((w) => (w.week ?? '').replace(/^\d{4}-/, '')) ?? [];
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Tickets closed" value={String(s.operator.tickets_closed)} note="Verified by checks" />
              <Stat label="SLA met" value={`${s.operator.sla_met_pct}%`} />
              <Stat label="Mean time to resolve" value={`${s.operator.mttr_minutes} min`} note="Opened to verified" />
              <Stat label="Reopen rate" value={`${s.operator.reopen_rate_pct}%`} note="A check failed after Resolve" />
              <Stat label="Avg debrief score" value={String(s.operator.avg_debrief_score)} />
              <Stat label="Hints per ticket" value={String(s.operator.hints_per_ticket ?? 0)} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Pane title="Debrief score and SLA met, by week">
                <div className="p-2">
                  <LineChart label="Debrief score and SLA met by week" labels={labels} yMax={100} series={[{ name: 'Debrief score', values: s.operator.trend?.map((w) => w.avg_debrief_score ?? 0) ?? [], color: '--action' }, { name: 'SLA met %', values: s.operator.trend?.map((w) => w.sla_met_pct ?? 0) ?? [], color: '--healthy' }]} />
                </div>
              </Pane>
              <Pane title="Mean time to resolve, by week">
                <div className="p-2">
                  <LineChart label="Mean time to resolve by week in minutes" labels={labels} unit=" min" series={[{ name: 'Minutes', values: s.operator.trend?.map((w) => w.mttr_minutes ?? 0) ?? [], color: '--degraded' }]} />
                </div>
              </Pane>
            </div>
            <p className="text-[12px] text-faint">Every number comes from the evidence database: scope is this lab, method is automatic checks plus scored debriefs, generated {new Date(s.generated_at).toLocaleString()}.</p>
          </div>
        );
      }}
    </QueryView>
  );
}

function Controls() {
  const q = useControls();
  const sc = useScorecards();
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-[13px] text-muted">The Control Validation Engine runs benign attempts against the lab after every change and nightly. It tests whether the company's own controls hold, separately from how well you operate.</p>
      {sc.data && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Stat label="Controls passing" value={`${sc.data.control.pass_pct}%`} />
          {sc.data.control.families.map((f) => (
            <Stat key={f.family} label={`${f.family} (${f.nist_csf})`} value={`${f.passed}/${f.total}`} />
          ))}
        </div>
      )}
      <Pane>
        <QueryView q={q}>
          {(cs) => (
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">Control</th>
                  <th className="px-3 py-2 font-medium">Automated attempt</th>
                  <th className="px-3 py-2 font-medium">Pass means</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {cs.map((c) => (
                  <tr key={c.id} className={cx('border-b border-line', !c.passed && 'bg-down/5')}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.control}</p>
                      <p className="text-[12px] text-faint">
                        {c.id} · {c.family}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-muted">{c.attempt}</td>
                    <td className="px-3 py-2 text-muted">{c.expected}</td>
                    <td className="px-3 py-2">{c.passed ? <Badge tone="good">pass</Badge> : <Badge tone="bad">fail</Badge>}</td>
                    <td className="px-3 py-2 text-[12.5px]">{c.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </QueryView>
      </Pane>
    </div>
  );
}

function TicketEvidence({ id }: { id: string | null }) {
  const router = useRouter();
  const closed = useTickets({ status: ['closed'], limit: 200 });
  const t = useTicket(id);
  const d = useDebrief(id);
  return (
    <div className="flex h-[calc(100vh-180px)] gap-2">
      <Pane className="w-[340px] shrink-0" title="Closed tickets">
        <QueryView q={closed} empty={(x) => (x.items.length ? false : <EmptyState title="No closed tickets yet" />)}>
          {(x) => (
            <ul className="divide-y divide-line">
              {x.items.map((tk) => (
                <li key={tk.id}>
                  <button onClick={() => router.replace(`/evidence?tab=tickets&ticket=${tk.id}`)} className={cx('block w-full px-3 py-2 text-left text-[13px] hover:bg-pane-2', id === tk.id && 'bg-pane-2')}>
                    <span className="flex items-center gap-2">
                      <PriorityBadge p={tk.priority} /> <span className="font-semibold">{tk.number}</span>
                      {tk.sla_breached ? <Badge tone="bad">SLA missed</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-muted">{tk.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Pane>
      <Pane
        className="min-w-0 flex-1"
        title={t.data ? `${t.data.number} evidence trail` : 'Evidence trail'}
        actions={
          id ? (
            <Link href={`/replay/${id}`}>
              <Button size="sm">Replay</Button>
            </Link>
          ) : null
        }
      >
        {id ? (
          <div>
            {d.data?.overall_score != null && (
              <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-[13px]">
                <span className="text-muted">Debrief</span>
                <span className="text-[18px] font-semibold tabular-nums">{d.data.overall_score}</span>
                {!!d.data.study_list?.length && <span className="text-muted">Study: {d.data.study_list.join(', ')}</span>}
              </div>
            )}
            <EvidenceList ticketId={id} />
          </div>
        ) : (
          <EmptyState title="Pick a ticket" body="Every status change, command, chat message, check and debrief answer is recorded, hash-chained, in order." />
        )}
      </Pane>
    </div>
  );
}

function EvidenceInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get('tab') ?? (sp.get('ticket') ? 'tickets' : 'scorecards')) as 'scorecards' | 'controls' | 'tickets';
  const tabs = useMemo(() => [{ key: 'scorecards' as const, label: 'Operator scorecard' }, { key: 'controls' as const, label: 'Control scorecard' }, { key: 'tickets' as const, label: 'Ticket evidence' }], []);
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-[18px] font-semibold">Evidence and scorecards</h1>
      <Tabs tabs={tabs} value={tab} onChange={(k) => router.replace(`/evidence?tab=${k}`)} />
      {tab === 'scorecards' && <Scorecards />}
      {tab === 'controls' && <Controls />}
      {tab === 'tickets' && <TicketEvidence id={sp.get('ticket')} />}
    </div>
  );
}

export default function EvidencePage() {
  return (
    <Suspense>
      <EvidenceInner />
    </Suspense>
  );
}
