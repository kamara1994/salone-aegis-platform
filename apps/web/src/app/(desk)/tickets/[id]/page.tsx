'use client';

import { useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTicket, useTopology } from '@/api/hooks';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ConsoleView } from '@/components/console/ConsoleView';
import { DockLayout, resetLayout, type DockPanelDef } from '@/components/dock/DockLayout';
import { EdgePanel } from '@/components/map/EdgePanel';
import { NodePanel } from '@/components/map/NodePanel';
import { TopologyMap } from '@/components/map/TopologyMap';
import { awaitJob, errorText, useApi } from '@/components/providers';
import { ChecksPanel, EvidenceList, HintsPanel, Timeline, TicketHeader, WorkNotes } from '@/components/tickets/TicketParts';
import { Badge, Button, ConfirmDialog, cx, ErrorState, Loading, QueryView } from '@/components/ui';
import { useUi } from '@/state/ui';

function ConsolesPanel({ ticketId, nodeIds }: { ticketId: string; nodeIds: string[] }) {
  const topo = useTopology('all');
  const nodes = (topo.data?.nodes ?? []).filter((n) => nodeIds.includes(n.id) && n.consoles?.length);
  const all = (topo.data?.nodes ?? []).filter((n) => n.consoles?.length && n.client_id === topo.data?.nodes.find((x) => nodeIds.includes(x.id))?.client_id);
  const [active, setActive] = useState<string | null>(null);
  const cur = active ?? nodes[0]?.id ?? null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1">
        {nodes.map((n) => (
          <button key={n.id} onClick={() => setActive(n.id)} className={cx('rounded px-2 py-0.5 text-[12.5px]', cur === n.id ? 'bg-pane-2 text-text' : 'text-muted hover:text-text')}>
            {n.name}
          </button>
        ))}
        <select aria-label="Open another node's console" className="ml-auto h-7 rounded border border-line-strong bg-ink px-1.5 text-[12px]" value="" onChange={(e) => e.target.value && setActive(e.target.value)}>
          <option value="">Other node…</option>
          {all.filter((n) => !nodeIds.includes(n.id)).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">{cur ? <ConsoleView key={cur} nodeId={cur} ticketId={ticketId} /> : <p className="p-4 text-[13px] text-muted">No console on the affected nodes.</p>}</div>
    </div>
  );
}

export default function TicketWorkspace() {
  const { id } = useParams<{ id: string }>();
  const q = useTicket(id);
  const topo = useTopology('all');
  const api = useApi();
  const router = useRouter();
  const toast = useUi((s) => s.toast);
  const [sel, setSel] = useState<{ node?: string; edge?: string }>({});
  const [version, setVersion] = useState(0);
  const [abortOpen, setAbortOpen] = useState(false);
  const t = q.data;
  const abort = useMutation({
    mutationFn: async () => {
      const job = await api.abortScenarioRun(t!.scenario_run_id!);
      await awaitJob(job.id);
    },
    onSuccess: () => {
      setAbortOpen(false);
      toast({ tone: 'info', title: `${t?.number} aborted`, body: 'The fault was removed and the baseline restored.' });
      router.push('/tickets');
    },
    onError: (e) => toast({ tone: 'danger', title: 'Abort failed', body: errorText(e) }),
  });

  const panels = useMemo<Record<string, DockPanelDef>>(() => {
    if (!t) return {} as Record<string, DockPanelDef>;
    const p: Record<string, DockPanelDef> = {
      details: {
        title: 'Ticket',
        render: () => (
          <div className="space-y-3 p-3 text-[13px]">
            <p className="whitespace-pre-wrap">{t.description}</p>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[12.5px]">
              <dt className="text-muted">Reported by</dt>
              <dd>
                {t.persona?.name} · {t.persona?.role}
              </dd>
              <dt className="text-muted">Category</dt>
              <dd>{t.category}</dd>
              <dt className="text-muted">Assignee</dt>
              <dd>{t.assignee ?? 'Unclaimed'}</dd>
              <dt className="text-muted">Affected</dt>
              <dd className="flex flex-wrap gap-1">
                {(t.affected_node_ids ?? []).map((nid) => (
                  <button key={nid} className="hover:underline" onClick={() => setSel({ node: nid })}>
                    <Badge>{topo.data?.nodes.find((n) => n.id === nid)?.name ?? nid}</Badge>
                  </button>
                ))}
              </dd>
              <dt className="text-muted">Opened</dt>
              <dd>{new Date(t.created_at).toLocaleString()}</dd>
              <dt className="text-muted">Tags</dt>
              <dd className="flex flex-wrap gap-1">{t.tags?.map((g) => <Badge key={g}>{g}</Badge>)}</dd>
            </dl>
            {t.scenario_run_id && t.status !== 'closed' && (
              <Button size="sm" variant="ghost" onClick={() => setAbortOpen(true)}>
                Abort scenario and restore baseline
              </Button>
            )}
          </div>
        ),
      },
      chat: { title: 'Client chat', render: () => <ChatPanel t={t} /> },
      console: { title: 'Console', render: () => <ConsolesPanel ticketId={t.id} nodeIds={t.affected_node_ids ?? []} /> },
      checks: { title: `Checks (${t.checks.filter((c) => c.passed).length}/${t.checks.length})`, render: () => <ChecksPanel t={t} /> },
      runbook: { title: 'Runbook and hints', render: () => <HintsPanel t={t} /> },
      notes: { title: `Work notes (${t.work_notes.length})`, render: () => <WorkNotes t={t} /> },
      timeline: { title: 'Timeline', render: () => <Timeline t={t} /> },
      evidence: { title: 'Evidence', render: () => <EvidenceList ticketId={t.id} /> },
      map: {
        title: 'Affected map',
        render: () => (
          <QueryView q={topo}>
            {(tp) => <TopologyMap topo={tp} compact focusOnly highlight={t.affected_node_ids ?? []} selectedEdge={sel.edge} onNodeClick={(n) => setSel({ node: n.id })} onEdgeClick={(e) => setSel({ edge: e })} />}
          </QueryView>
        ),
      },
      inspect: { title: 'Inspector', render: () => (sel.node ? <NodePanel nodeId={sel.node} ticketId={t.id} /> : sel.edge ? <EdgePanel edgeId={sel.edge} /> : <p className="p-4 text-[13px] text-muted">Click an affected node or a link on the map.</p>) },
    };
    return p;
  }, [t, topo, sel]);

  if (q.isLoading) return <Loading rows={8} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!t) return null;
  return (
    <div className="flex h-full flex-col">
      <TicketHeader t={t} />
      <div className="flex justify-end px-3 pt-1 text-[12px] text-muted">
        <button className="hover:text-text" onClick={() => { resetLayout('ticket'); setVersion((v) => v + 1); }}>
          Reset layout
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DockLayout
          key={version}
          storageKey="ticket"
          panels={panels}
          buildDefault={(add) => {
            add('chat');
            add('details', { ref: 'chat', dir: 'within' });
            add('console', { ref: 'chat', dir: 'right', size: 640 });
            add('map', { ref: 'console', dir: 'within' });
            add('checks', { ref: 'console', dir: 'right', size: 330 });
            add('runbook', { ref: 'checks', dir: 'within' });
            add('inspect', { ref: 'checks', dir: 'within' });
            add('notes', { ref: 'checks', dir: 'below' });
            add('timeline', { ref: 'notes', dir: 'within' });
            add('evidence', { ref: 'notes', dir: 'within' });
          }}
        />
      </div>
      <ConfirmDialog open={abortOpen} onClose={() => setAbortOpen(false)} onConfirm={() => abort.mutate()} busy={abort.isPending} title={`Abort ${t.number}?`} confirmLabel="Abort and restore" body="The scenario's cleanup scripts run, the fault is removed and the ticket closes without a debrief. Nothing is scored." />
    </div>
  );
}
