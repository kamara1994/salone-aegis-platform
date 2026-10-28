'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Lightbulb, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useEvidence, useScenarios } from '@/api/hooks';
import type { Hint, TicketDetail } from '@/api/types';
import { TICKET_FLOW } from '@/api/types';
import { awaitJob, errorText, useApi } from '@/components/providers';
import { Badge, Button, cx, Dialog, EmptyState, Field, PriorityBadge, QueryView, relTime, SlaClock, STATUS_LABEL, Textarea, useNow } from '@/components/ui';
import { useUi } from '@/state/ui';

export function StatusStepper({ s }: { s: TicketDetail['status'] }) {
  const idx = TICKET_FLOW.indexOf(s);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11.5px]" aria-label="Ticket progress">
      {TICKET_FLOW.map((st, i) => (
        <li key={st} className="flex items-center gap-1">
          <span className={cx('rounded px-1.5 py-0.5', i < idx ? 'text-healthy' : i === idx ? 'bg-action text-white' : 'text-faint')} aria-current={i === idx ? 'step' : undefined}>
            {STATUS_LABEL[st]}
          </span>
          {i < TICKET_FLOW.length - 1 && <span className="text-faint">›</span>}
        </li>
      ))}
    </ol>
  );
}

export function TicketHeader({ t }: { t: TicketDetail }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const openDebrief = useUi((s) => s.openDebrief);
  const [resolveOpen, setResolveOpen] = useState(false);
  const move = useMutation({
    mutationFn: (status: TicketDetail['status']) => api.updateTicket(t.id, { status }),
    onSuccess: (r) => qc.setQueryData(['ticket', t.id], r),
    onError: (e) => toast({ tone: 'danger', title: 'Could not update the ticket', body: errorText(e) }),
  });
  return (
    <div className="space-y-2 border-b border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge p={t.priority} />
        <h1 className="text-[16px] font-semibold">
          {t.number} <span className="font-normal">{t.title}</span>
        </h1>
        {t.mode === 'exam' && <Badge tone="warn">Exam mode</Badge>}
        {t.sla_breached && <Badge tone="bad">SLA breached</Badge>}
        <div className="ml-auto flex items-center gap-2 text-[12.5px]">
          <SlaClock due={t.sla_due_at} closed={t.status === 'closed'} />
          {t.status === 'new' && (
            <Button size="sm" variant="primary" busy={move.isPending} onClick={() => move.mutate('acknowledged')}>
              Claim ticket
            </Button>
          )}
          {t.status === 'acknowledged' && (
            <Button size="sm" variant="primary" busy={move.isPending} onClick={() => move.mutate('investigating')}>
              Start investigating
            </Button>
          )}
          {(t.status === 'investigating' || t.status === 'acknowledged') && (
            <Button size="sm" variant={t.status === 'investigating' ? 'primary' : 'secondary'} disabled={!t.work_notes.length} title={t.work_notes.length ? 'Run the checks' : 'Add a work note first'} onClick={() => setResolveOpen(true)}>
              Resolve
            </Button>
          )}
          {t.status === 'debrief' && (
            <Button size="sm" variant="primary" onClick={() => openDebrief(t.id)}>
              Open debrief
            </Button>
          )}
        </div>
      </div>
      <StatusStepper s={t.status} />
      <ResolveDialog t={t} open={resolveOpen} onClose={() => setResolveOpen(false)} />
    </div>
  );
}

export function ResolveDialog({ t, open, onClose }: { t: TicketDetail; open: boolean; onClose: () => void }) {
  const api = useApi();
  const toast = useUi((s) => s.toast);
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: async () => {
      const job = await api.resolveTicket(t.id, note);
      onClose();
      return awaitJob(job.id);
    },
    onSuccess: (r) => {
      if (r?.passed) toast({ tone: 'success', title: `${t.number}: all checks passed`, body: 'Now explain the fix to the client in plain words.' });
    },
    onError: (e) => toast({ tone: 'danger', title: 'Could not resolve', body: errorText(e) }),
  });
  return (
    <Dialog open={open} onClose={onClose} title={`Resolve ${t.number}`}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Resolving runs {t.checks.length} automatic check{t.checks.length === 1 ? '' : 's'} against the lab. If any fails, the ticket goes back to investigating.</p>
        <Field label="Resolution note" hint="What was wrong, what you changed, how you verified it. At least 10 characters.">
          <Textarea autoFocus rows={5} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={note.trim().length < 10} busy={resolve.isPending} onClick={() => resolve.mutate()}>
            Run checks
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ChecksPanel({ t }: { t: TicketDetail }) {
  if (!t.checks.length) return <EmptyState title="No checks defined" />;
  const ran = t.checks.some((c) => c.passed !== null && c.passed !== undefined) || t.status === 'pending_verification';
  return (
    <div className="space-y-2 p-3">
      <p className="text-[12.5px] text-muted">{ran ? 'Results from the last run.' : 'These run automatically when you resolve. You cannot close a ticket by saying it is fixed; the lab is tested.'}</p>
      <ul className="space-y-2">
        {t.checks.map((c) => {
          const running = t.status === 'pending_verification' && (c.passed === null || c.passed === undefined);
          return (
            <li key={c.id} className="rounded border border-line p-2 text-[13px]" data-testid={`check-${c.check_id}`}>
              <div className="flex items-center gap-2">
                {running ? <Loader2 className="size-4 animate-spin text-action" /> : c.passed === true ? <CheckCircle2 className="size-4 text-healthy" /> : c.passed === false ? <XCircle className="size-4 text-down" /> : <CircleDashed className="size-4 text-faint" />}
                <span className="font-medium">{c.label ?? c.check_id}</span>
              </div>
              {c.output && <p className={cx('mt-1 pl-6 text-[12.5px]', c.passed ? 'text-muted' : 'text-down')}>{c.output}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HintsPanel({ t }: { t: TicketDetail }) {
  const api = useApi();
  const qc = useQueryClient();
  const scen = useScenarios();
  const [hints, setHints] = useState<Hint[]>([]);
  const take = useMutation({
    mutationFn: () => api.takeHint(t.scenario_run_id!),
    onSuccess: (h) => {
      setHints((x) => [...x, h]);
      qc.invalidateQueries({ queryKey: ['ticket', t.id] });
    },
  });
  const pack = scen.data?.find((s) => s.title === t.title || t.tags?.every((g) => s.tags.includes(g)));
  const runbook = RUNBOOKS[t.category ?? ''] ?? RUNBOOKS.default;
  return (
    <div className="space-y-4 p-3 text-[13px]">
      <section>
        <h3 className="mb-1.5 text-[12.5px] font-semibold">Runbook: {t.category}</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          {runbook.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>
      {t.scenario_run_id && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[12.5px] font-semibold">Hint ladder</h3>
            <span className="text-[12px] text-muted">
              {t.hints_used ?? 0} of {t.hints_available ?? 0} used · each costs more points
            </span>
          </div>
          {hints.map((h) => (
            <div key={h.rung} className="rounded border border-degraded/40 bg-degraded/5 p-2">
              <p className="text-[12px] text-degraded">
                Hint {h.rung} · -{h.points_cost} points
              </p>
              <p className="mt-0.5">{h.text}</p>
            </div>
          ))}
          {t.mode === 'exam' ? (
            <p className="text-[12.5px] text-muted">Exam mode: hints are off.</p>
          ) : (t.hints_used ?? 0) < (t.hints_available ?? 0) && t.status !== 'closed' ? (
            <Button size="sm" busy={take.isPending} onClick={() => take.mutate()}>
              <Lightbulb className="size-3.5" /> {(t.hints_used ?? 0) === 0 ? 'Take a nudge' : (t.hints_used ?? 0) === 1 ? 'Take a direction' : 'Show the answer'}
            </Button>
          ) : null}
          {take.error && <p className="text-[12.5px] text-down">{errorText(take.error)}</p>}
          {(t.hints_used ?? 0) > hints.length && <p className="text-[12px] text-faint">{(t.hints_used ?? 0) - hints.length} earlier hint(s) are in the evidence trail.</p>}
        </section>
      )}
      {pack && <p className="text-[12px] text-faint">Scenario {pack.id} v{pack.version} · tags {pack.tags.join(', ')}</p>}
    </div>
  );
}

const RUNBOOKS: Record<string, string[]> = {
  network: ['Confirm the symptom with the user: what fails, since when, who else.', 'Work up the layers: link, IP address, gateway, remote IP, then names.', 'Compare against the known-good config (IPAM, NetBox, switch templates).', 'Change through the right tool, then verify from the user’s side.', 'Write what you found and changed in the work notes.'],
  identity: ['Confirm who is affected and what they cannot do.', 'Check the account: enabled, locked, groups, recent changes.', 'Find the source of the problem (events, change history), not just the symptom.', 'Fix with least privilege; tell the user if they must sign out.', 'Record the change and the reason.'],
  security: ['Scope first: hosts, accounts, time window.', 'Preserve evidence before changing anything.', 'Decide: true positive, false positive, benign, or not enough evidence.', 'Contain narrowly, through an approved change.', 'Document the timeline and what would prevent it.'],
  onboarding: ['Confirm the request is from HR or the manager (not just the new hire).', 'Create the account using the naming convention, in the right OU.', 'Grant access through role groups, nothing extra.', 'Require MFA enrollment before first use.', 'Confirm with the requester and document.'],
  service: ['Declare the incident and tell the business when the next update comes.', 'Find the shared dependency behind many symptoms.', 'Restore service first, then root cause.', 'Verify from users’ side across sites.', 'Write the postmortem actions.'],
  default: ['Confirm the symptom.', 'Collect evidence.', 'Find the cause.', 'Fix and verify.', 'Document.'],
};

export function WorkNotes({ t }: { t: TicketDetail }) {
  const api = useApi();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const now = useNow(30_000);
  const add = useMutation({
    mutationFn: () => api.updateTicket(t.id, { add_work_note: body }),
    onSuccess: (r) => {
      qc.setQueryData(['ticket', t.id], r);
      setBody('');
    },
  });
  return (
    <div className="flex h-full flex-col">
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {!t.work_notes.length && <li className="text-[13px] text-muted">No work notes yet. Notes are required before resolving and become your documentation.</li>}
        {t.work_notes.map((n) => (
          <li key={n.id} className="rounded border border-line p-2 text-[13px]">
            <p className="text-[12px] text-muted">
              {n.author} · {relTime(n.created_at, now)}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      {t.status !== 'closed' && (
        <div className="space-y-2 border-t border-line p-3">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What you checked, what you found, what you changed…" aria-label="New work note" />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={!body.trim()} busy={add.isPending} onClick={() => add.mutate()}>
              Add note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Timeline({ t }: { t: TicketDetail }) {
  return (
    <ol className="space-y-0 p-3">
      {[...t.timeline].reverse().map((e, i) => (
        <li key={i} className="relative border-l border-line pb-3 pl-4 text-[13px]">
          <span className={cx('absolute top-1.5 -left-[4.5px] size-2 rounded-full', e.kind === 'status' ? 'bg-action' : e.kind === 'change' ? 'bg-degraded' : e.kind === 'hint' ? 'bg-degraded' : 'bg-line-strong')} />
          <p className="text-[12px] text-muted">{new Date(e.at).toLocaleString()}</p>
          <p>{e.summary}</p>
        </li>
      ))}
    </ol>
  );
}

export function EvidenceList({ ticketId }: { ticketId: string }) {
  const q = useEvidence(ticketId);
  return (
    <QueryView q={q} empty={(d) => (d.length ? false : <p className="p-4 text-[13px] text-muted">Nothing recorded yet.</p>)}>
      {(recs) => (
        <ol className="divide-y divide-line text-[12.5px]">
          {recs.map((r) => (
            <li key={r.id} className="px-3 py-2">
              <div className="flex items-center gap-2 text-muted">
                <Badge>{r.kind.replace('_', ' ')}</Badge>
                <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                <span className="ml-auto font-mono text-[11px] text-faint" title="Hash chained to the previous record">
                  {r.hash?.slice(0, 12)}
                </span>
              </div>
              <EvidenceBody payload={r.payload} kind={r.kind} />
            </li>
          ))}
        </ol>
      )}
    </QueryView>
  );
}

function EvidenceBody({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  if (kind === 'command')
    return (
      <details className="mt-1">
        <summary className="cursor-pointer font-mono">
          {String(payload.node)}&gt; {String(payload.command)}
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-ink p-2 font-mono text-[11px] whitespace-pre-wrap text-muted">{String(payload.output ?? '')}</pre>
      </details>
    );
  if (kind === 'chat') return <p className="mt-1"><span className="text-muted">{String(payload.author)}:</span> {String(payload.body)}</p>;
  if (kind === 'check') return <p className={cx('mt-1', payload.passed ? 'text-healthy' : 'text-down')}>{String(payload.label ?? payload.check_id)}: {payload.passed ? 'passed' : `failed. ${String(payload.output ?? '')}`}</p>;
  if (kind === 'status_change') return <p className="mt-1">{String(payload.from ?? 'created')} → {String(payload.to)}{payload.reason ? ` (${String(payload.reason)})` : ''}</p>;
  return <p className="mt-1 break-words text-muted">{Object.entries(payload).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}</p>;
}
