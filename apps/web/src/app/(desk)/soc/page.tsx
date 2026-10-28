'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAlerts, useTopology } from '@/api/hooks';
import type { Alert, AlertVerdict } from '@/api/types';
import { errorText, useApi } from '@/components/providers';
import { Badge, Button, cx, EmptyState, Field, Pane, PriorityBadge, QueryView, relTime, Textarea, useNow } from '@/components/ui';
import { useUi } from '@/state/ui';

const VERDICTS: { v: AlertVerdict; label: string; hint: string }[] = [
  { v: 'true_positive', label: 'True positive', hint: 'Real and malicious. Contain and investigate.' },
  { v: 'benign_true_positive', label: 'Benign true positive', hint: 'It really happened, but it is expected or harmless.' },
  { v: 'false_positive', label: 'False positive', hint: 'The rule fired on something that did not happen as described.' },
  { v: 'insufficient_evidence', label: 'Insufficient evidence', hint: 'Cannot decide yet. Say what you would collect next.' },
];

function AlertDetail({ a }: { a: Alert }) {
  const api = useApi();
  const qc = useQueryClient();
  const topo = useTopology('all');
  const toast = useUi((s) => s.toast);
  const openConsole = useUi((s) => s.openConsole);
  const [verdict, setVerdict] = useState<AlertVerdict | null>(a.verdict ?? null);
  const [why, setWhy] = useState('');
  const [openTicket, setOpenTicket] = useState(false);
  useEffect(() => {
    setVerdict(a.verdict ?? null);
    setWhy('');
  }, [a.id, a.verdict]);
  const claim = useMutation({ mutationFn: () => api.claimAlert(a.id), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }), onError: (e) => toast({ tone: 'danger', title: 'Could not claim', body: errorText(e) }) });
  const classify = useMutation({
    mutationFn: () => api.classifyAlert(a.id, { verdict: verdict!, rationale: why, open_ticket: openTicket }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast({ tone: 'success', title: 'Alert classified', body: 'Your verdict and rationale are in the evidence trail.' });
    },
    onError: (e) => toast({ tone: 'danger', title: 'Could not classify', body: errorText(e) }),
  });
  const node = topo.data?.nodes.find((n) => n.id === a.node_id);
  return (
    <div className="space-y-4 p-4 text-[13px]">
      <div>
        <div className="flex items-center gap-2">
          <PriorityBadge p={a.severity} />
          <h2 className="text-[16px] font-semibold">{a.rule}</h2>
        </div>
        <p className="mt-1 text-muted">
          Rule {a.rule_id} · ATT&CK {a.attack_technique} · {node?.name ?? 'unknown host'} · {new Date(a.created_at).toLocaleString()}
        </p>
      </div>
      <table className="w-full text-[12.5px]">
        <tbody>
          {Object.entries(a.fields ?? {}).map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <td className="w-40 py-1.5 pr-3 text-muted">{k.replace(/_/g, ' ')}</td>
              <td className="py-1.5 font-mono">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        {a.state === 'new' && (
          <Button variant="primary" busy={claim.isPending} onClick={() => claim.mutate()}>
            Claim alert
          </Button>
        )}
        {node?.consoles?.length ? (
          <Button onClick={() => openConsole(node.id, a.linked_ticket_id)}>Open {node.name} console</Button>
        ) : null}
        {a.linked_ticket_id && (
          <Link href={`/tickets/${a.linked_ticket_id}`}>
            <Button>Open linked ticket</Button>
          </Link>
        )}
      </div>
      {a.state === 'classified' ? (
        <div className="rounded border border-line p-3">
          <p>
            Classified as <span className="font-semibold">{a.verdict?.replace(/_/g, ' ')}</span> by {a.claimed_by}.
          </p>
        </div>
      ) : a.state === 'claimed' ? (
        <div className="space-y-3 rounded border border-line p-3">
          <h3 className="font-semibold">Your verdict</h3>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Verdict</legend>
            {VERDICTS.map((x) => (
              <label key={x.v} className={cx('flex cursor-pointer gap-2 rounded border p-2', verdict === x.v ? 'border-action' : 'border-line')}>
                <input type="radio" name="verdict" checked={verdict === x.v} onChange={() => setVerdict(x.v)} className="mt-0.5" />
                <span>
                  <span className="font-medium">{x.label}</span>
                  <span className="block text-[12px] text-muted">{x.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="Rationale" hint="What evidence led you here. This is scored and goes in the evidence trail.">
            <Textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
          {!a.linked_ticket_id && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={openTicket} onChange={(e) => setOpenTicket(e.target.checked)} /> Open an investigation ticket
            </label>
          )}
          <Button variant="primary" disabled={!verdict || why.trim().length < 10} busy={classify.isPending} onClick={() => classify.mutate()}>
            Classify
          </Button>
        </div>
      ) : (
        <p className="text-muted">Claim the alert to move it into your investigation and classify it.</p>
      )}
    </div>
  );
}

function SocInner() {
  const q = useAlerts();
  const sp = useSearchParams();
  const [sel, setSel] = useState<string | null>(sp.get('alert'));
  const [showDone, setShowDone] = useState(false);
  const now = useNow(30_000);
  const items = q.data?.items.filter((a) => showDone || a.state !== 'classified') ?? [];
  const cur = q.data?.items.find((a) => a.id === sel) ?? null;
  return (
    <div className="flex h-full gap-2 p-2">
      <Pane
        className="w-[420px] shrink-0"
        title="SOC alert queue"
        actions={
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show classified
          </label>
        }
      >
        <QueryView q={q} empty={() => (items.length ? false : <EmptyState title="Queue clear" body="New alerts from the SIEM land here, true and false positives mixed." />)}>
          {() => (
            <ul className="divide-y divide-line">
              {items.map((a) => (
                <li key={a.id}>
                  <button onClick={() => setSel(a.id)} className={cx('block w-full px-3 py-2 text-left text-[13px] hover:bg-pane-2', sel === a.id && 'bg-pane-2')}>
                    <div className="flex items-center gap-2">
                      <PriorityBadge p={a.severity} />
                      <span className="truncate font-medium">{a.rule}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                      <span>{a.attack_technique}</span>
                      <Badge tone={a.state === 'new' ? 'info' : a.state === 'claimed' ? 'warn' : 'neutral'}>{a.state}</Badge>
                      {a.verdict && <span>{a.verdict.replace(/_/g, ' ')}</span>}
                      <span className="ml-auto">{relTime(a.created_at, now)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Pane>
      <Pane className="min-w-0 flex-1" title="Investigation">
        {cur ? <AlertDetail a={cur} /> : <EmptyState title="Pick an alert" body="Claim it, look at the evidence, open a console if you need to, then classify it with a rationale." />}
      </Pane>
    </div>
  );
}

export default function SocPage() {
  return (
    <Suspense>
      <SocInner />
    </Suspense>
  );
}
