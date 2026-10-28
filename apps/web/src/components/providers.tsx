'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiRequestError } from '@/api/client';
import { getRuntime, type Runtime } from '@/api/runtime';
import type { AegisEvent, ChatMessage, FlowBatchData, Topology } from '@/api/types';
import { useLive, useUi } from '@/state/ui';

const RuntimeCtx = createContext<Runtime | null>(null);

export function useRuntime(): Runtime {
  const r = useContext(RuntimeCtx);
  if (!r) throw new Error('useRuntime outside AegisProvider');
  return r;
}
export const useApi = () => useRuntime().api;

/** Wait for a 202 job to finish (job.completed / job.failed). */
export function awaitJob(jobId: string, timeoutMs = 60_000): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const j = useLive.getState().jobs[jobId];
      if (j?.status === 'completed') return resolve(j.result);
      if (j?.status === 'failed') return reject(new Error(j.error ?? 'Job failed'));
      if (Date.now() - started > timeoutMs) return reject(new Error('Timed out waiting for the job to finish'));
      setTimeout(check, 150);
    };
    check();
  });
}

export function errorText(e: unknown): string {
  if (e instanceof ApiRequestError) return `${e.message} (${e.operation}: ${e.code})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

function EventBridge({ rt }: { rt: Runtime }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const openDebrief = useUi((s) => s.openDebrief);

  useEffect(() => {
    const offState = rt.events.onState((connection) => useLive.setState({ connection }));
    const off = rt.events.on((e: AegisEvent) => {
      const d = e.data as Record<string, unknown>;
      switch (e.type) {
        case 'notification.created': {
          qc.invalidateQueries({ queryKey: ['notifications'] });
          const sev = d.severity as string;
          toast({ tone: sev === 'P1' ? 'danger' : sev === 'P2' ? 'warning' : 'info', title: String(d.title), body: String(d.body).slice(0, 160), href: d.ticket_id ? `/tickets/${d.ticket_id}` : undefined });
          if (d.push && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`AEGIS ${sev}: ${String(d.title)}`, { body: String(d.body).slice(0, 180), tag: String(d.id) });
            } catch {
              /* some browsers only allow notifications from a service worker */
            }
          }
          break;
        }
        case 'ticket.created':
        case 'ticket.updated':
        case 'ticket.status_changed':
          qc.invalidateQueries({ queryKey: ['tickets'] });
          qc.invalidateQueries({ queryKey: ['ticket', e.subject.id] });
          qc.invalidateQueries({ queryKey: ['evidence', e.subject.id] });
          qc.invalidateQueries({ queryKey: ['clients'] });
          if (e.type === 'ticket.status_changed' && d.to === 'closed') {
            qc.invalidateQueries({ queryKey: ['scorecards'] });
            qc.invalidateQueries({ queryKey: ['skills'] });
            qc.invalidateQueries({ queryKey: ['controls'] });
          }
          if (e.type === 'ticket.status_changed' && d.to === 'investigating' && d.from === 'pending_verification') {
            toast({ tone: 'warning', title: 'A check failed: the ticket reopened', body: 'Open the checks panel to see what is still broken.', href: `/tickets/${e.subject.id}` });
          }
          break;
        case 'chat.message': {
          const m = d as unknown as ChatMessage;
          qc.setQueryData<ChatMessage[]>(['chat', m.ticket_id], (old) => (old ? (old.some((x) => x.id === m.id) ? old : [...old, m]) : old));
          qc.invalidateQueries({ queryKey: ['evidence', m.ticket_id] });
          break;
        }
        case 'chat.typing':
          useLive.setState((s) => ({ typing: { ...s.typing, [String(d.ticket_id)]: !!d.typing } }));
          break;
        case 'check.result':
          qc.invalidateQueries({ queryKey: ['ticket', String(d.ticket_id)] });
          break;
        case 'scenario.state_changed':
          qc.invalidateQueries({ queryKey: ['tickets'] });
          qc.invalidateQueries({ queryKey: ['topology'] });
          break;
        case 'node.health_changed':
          qc.setQueriesData<Topology>({ queryKey: ['topology'] }, (old) =>
            old ? { ...old, nodes: old.nodes.map((n) => (n.id === e.subject.id ? { ...n, health: d.health as Topology['nodes'][number]['health'], power: (d.power as Topology['nodes'][number]['power']) ?? n.power } : n)) } : old,
          );
          qc.invalidateQueries({ queryKey: ['node', e.subject.id] });
          qc.invalidateQueries({ queryKey: ['clients'] });
          qc.invalidateQueries({ queryKey: ['controls'] });
          break;
        case 'flow.batch': {
          const fb = d as unknown as FlowBatchData;
          const flows: Record<string, { bytes_per_s: number; allowed: number; denied: number; top_app?: string }> = {};
          for (const x of fb.edges) flows[x.edge_id] = x;
          useLive.setState({ flows });
          break;
        }
        case 'alert.fired':
        case 'alert.updated':
          qc.invalidateQueries({ queryKey: ['alerts'] });
          break;
        case 'debrief.started':
          qc.invalidateQueries({ queryKey: ['debrief', String(d.ticket_id)] });
          openDebrief(String(d.ticket_id));
          break;
        case 'debrief.question':
        case 'debrief.scored':
          qc.invalidateQueries({ queryKey: ['debrief'] });
          if (d.final) {
            qc.invalidateQueries({ queryKey: ['scorecards'] });
            qc.invalidateQueries({ queryKey: ['skills'] });
          }
          break;
        case 'job.completed':
        case 'job.failed':
          useLive.setState((s) => ({ jobs: { ...s.jobs, [String(d.job_id)]: { status: e.type === 'job.completed' ? 'completed' : 'failed', error: d.error as string | undefined, result: d.result as Record<string, unknown> | undefined } } }));
          if (String(d.kind).startsWith('node') || d.kind === 'baseline.restore') {
            qc.invalidateQueries({ queryKey: ['topology'] });
            qc.invalidateQueries({ queryKey: ['node'] });
          }
          if (e.type === 'job.failed') toast({ tone: 'danger', title: `${String(d.kind)} failed`, body: String(d.error ?? '') });
          break;
      }
    });
    rt.events.connect();
    return () => {
      off();
      offState();
    };
  }, [rt, qc, toast, openDebrief]);
  return null;
}

export function AegisProvider({ children }: { children: ReactNode }) {
  const [rt, setRt] = useState<Runtime | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const qcRef = useRef<QueryClient | null>(null);
  qcRef.current ??= new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiRequestError && e.status < 500) && n < 2 },
    },
  });
  useEffect(() => {
    useUi.getState().hydrate();
    getRuntime().then(setRt, (e) => setFailed(errorText(e)));
  }, []);
  if (failed) return <div className="p-8 text-down">Could not start the cockpit: {failed}</div>;
  if (!rt) return <div className="grid h-screen place-items-center text-muted">Starting the cockpit…</div>;
  return (
    <RuntimeCtx.Provider value={rt}>
      <QueryClientProvider client={qcRef.current}>
        <EventBridge rt={rt} />
        {children}
      </QueryClientProvider>
    </RuntimeCtx.Provider>
  );
}
