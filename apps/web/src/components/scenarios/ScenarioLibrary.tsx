'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useScenarios } from '@/api/hooks';
import type { ScenarioMode, ScenarioSummary } from '@/api/types';
import { awaitJob, errorText, useApi } from '@/components/providers';
import { Badge, Button, cx, Dialog, Pane, PriorityBadge, QueryView } from '@/components/ui';
import { useUi } from '@/state/ui';

const DIFFICULTY = ['', 'Single clear fault', 'Vague ticket', 'Red herring', 'Two faults', 'Cascade', 'Overlapping incidents', 'Human pressure', 'Night page', 'Sabotage'];
const FILTERS = ['ccna', 'ccnp', 'security-plus', 'soc', 'interview', 'it-support', 'social-engineering', 'release-1'];

function LaunchDialog({ s, onClose }: { s: ScenarioSummary | null; onClose: () => void }) {
  const api = useApi();
  const router = useRouter();
  const toast = useUi((x) => x.toast);
  const [mode, setMode] = useState<ScenarioMode>('practice');
  const launch = useMutation({
    mutationFn: async () => {
      const job = await api.createScenarioRun({ scenario_id: s!.id, mode });
      return awaitJob(job.id);
    },
    onSuccess: (r) => {
      onClose();
      toast({ tone: 'info', title: `Launched: ${s?.title}`, body: 'The fault is injected. Your ticket is open.' });
      if (r?.ticket_id) router.push(`/tickets/${String(r.ticket_id)}`);
    },
  });
  return (
    <Dialog open={!!s} onClose={onClose} title={s ? `Launch “${s.title}”` : ''}>
      {s && (
        <div className="space-y-4 text-[13px]">
          <p className="text-muted">
            This injects a real fault into the lab and opens a {s.priority} ticket. You won't be told the cause. Interviewer afterwards: {s.interviewer?.replace(/-/g, ' ')}.
          </p>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Mode</legend>
            {(['practice', 'exam'] as const).map((m) => (
              <label key={m} className={cx('cursor-pointer rounded border p-3', mode === m ? 'border-action' : 'border-line')}>
                <input type="radio" name="mode" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                <span className="font-medium">{m === 'practice' ? 'Practice' : 'Exam'}</span>
                <span className="mt-0.5 block text-[12px] text-muted">{m === 'practice' ? 'Hints available (they cost points). Model answers after each debrief question.' : 'No hints, timed, model answers only at the end. Closest to a real interview.'}</span>
              </label>
            ))}
          </fieldset>
          {launch.error && <p className="text-down">{errorText(launch.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" busy={launch.isPending} onClick={() => launch.mutate()}>
              Inject fault and open ticket
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ScenariosInner({ initialTags = [] }: { initialTags?: string[] }) {
  const q = useScenarios();
  const sp = useSearchParams();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [launch, setLaunch] = useState<ScenarioSummary | null>(null);
  useEffect(() => {
    const id = sp.get('launch');
    if (id && q.data) setLaunch(q.data.find((s) => s.id === id) ?? null);
  }, [sp, q.data]);
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-3 text-[18px] font-semibold">Scenario library</h1>
        {FILTERS.map((f) => (
          <button key={f} aria-pressed={tags.includes(f)} onClick={() => setTags(tags.includes(f) ? tags.filter((x) => x !== f) : [...tags, f])} className={cx('rounded-[4px] border px-2 py-0.5 text-[12px]', tags.includes(f) ? 'border-action text-text' : 'border-line text-muted')}>
            {f}
          </button>
        ))}
      </div>
      <p className="max-w-3xl text-[13px] text-muted">The scheduler sends these automatically, weak skills first. Launch one yourself to practise a topic. Each pack follows Contract 4: a reversible fault, a client, a hint ladder, automatic checks and a debrief.</p>
      <Pane>
        <QueryView q={q}>
          {(list) => (
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">Scenario</th>
                  <th className="px-3 py-2 font-medium">Difficulty</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Shows up in</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {list
                  .filter((s) => tags.every((t) => s.tags.includes(t)))
                  .sort((a, b) => a.difficulty - b.difficulty)
                  .map((s) => (
                    <tr key={s.id} className="border-b border-line">
                      <td className="px-3 py-2">
                        <p className="font-medium">{s.title}</p>
                        <p className="font-mono text-[11.5px] text-faint">
                          {s.id} v{s.version} · {s.client_slug}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <span className="tabular-nums">{s.difficulty}</span> <span className="text-muted">{DIFFICULTY[s.difficulty]}</span>
                      </td>
                      <td className="px-3 py-2">{s.priority && <PriorityBadge p={s.priority} />}</td>
                      <td className="px-3 py-2 text-muted">{s.estimated_minutes ? `${s.estimated_minutes} min` : '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">{s.tags.map((t) => <Badge key={t} tone={t.startsWith('cc') ? 'info' : 'neutral'}>{t}</Badge>)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" onClick={() => setLaunch(s)}>
                          Launch
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </QueryView>
      </Pane>
      <LaunchDialog s={launch} onClose={() => setLaunch(null)} />
    </div>
  );
}

export function ScenarioLibrary({ initialTags }: { initialTags?: string[] } = {}) {
  return (
    <Suspense>
      <ScenariosInner initialTags={initialTags} />
    </Suspense>
  );
}
