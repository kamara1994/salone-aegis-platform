'use client';

import { Clock, Lock, Play, RotateCcw, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, cx, relTime } from '@/components/ui';
import { ARENA_LABS, ARENA_TOPICS, arenaLab, KIND_LABEL, KIND_ORDER, labsFor } from '@/lab/arena';
import { attemptsFor, bestFor, fmtTime, topicMastery, useArena } from '@/lab/arena/progress';
import type { ArenaLab } from '@/lab/arena/types';
import { ScoreRing } from './CheckResults';
import { KIND_TONE, Pips } from './ArenaPanel';

function LabCard({ lab, onLaunch }: { lab: ArenaLab; onLaunch: () => void }) {
  const prog = useArena();
  const best = bestFor(prog, lab.id);
  const tries = attemptsFor(prog, lab.id).length;
  const running = prog.active?.labId === lab.id;
  return (
    <li className="flex flex-col gap-2 rounded-[8px] border border-line bg-pane p-3 hover:border-line-strong" data-testid={`arena-lab-${lab.id}`}>
      <div className="flex items-center gap-2">
        <Badge tone={KIND_TONE[lab.kind]}>{KIND_LABEL[lab.kind]}</Badge>
        <Pips n={lab.difficulty} />
        <span className="ml-auto flex items-center gap-1 text-[11.5px] text-muted">
          <Clock className="size-3.5" aria-hidden />
          {lab.timeLimit ? `${lab.timeLimit} min limit` : `about ${lab.minutes} min`}
        </span>
      </div>
      <h3 className="text-[13.5px] leading-snug font-semibold text-balance">{lab.title}</h3>
      <p className="line-clamp-3 text-[12.5px] text-muted">{lab.brief.split('\n')[0]}</p>
      <div className="mt-auto flex items-center gap-3 pt-1">
        {best ? (
          <span className="flex items-center gap-2 text-[12px]">
            <ScoreRing pct={best.pct} size={34} label="Best score" />
            <span className="text-muted">
              Best {best.pct}%<br />
              {tries} attempt{tries === 1 ? '' : 's'}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-faint">Not attempted</span>
        )}
        <span className="text-[11.5px] text-faint">
          {lab.items.length} items · {lab.tests.length} tests
        </span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={onLaunch} data-testid={`arena-launch-${lab.id}`}>
          {running ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />} {running ? 'Resume' : best ? 'Retry' : 'Start'}
        </Button>
      </div>
    </li>
  );
}

/** Lab Arena: assessed, Packet Tracer style labs organised by CCNA topic, with a running record. */
export function ArenaHome({ embedded, onLaunch }: { embedded?: boolean; onLaunch?: (id: string) => void }) {
  const router = useRouter();
  const prog = useArena();
  const ready = ARENA_TOPICS.filter((t) => t.status === 'ready');
  const [topicId, setTopicId] = useState(ready[0]?.id ?? ARENA_TOPICS[0].id);
  const topic = ARENA_TOPICS.find((t) => t.id === topicId)!;
  const labs = labsFor(topicId);
  const overall = useMemo(() => {
    const all = prog.attempts;
    const labsDone = new Set(all.filter((a) => a.pct >= 80).map((a) => a.labId)).size;
    const secs = all.reduce((n, a) => n + a.seconds, 0);
    return { attempts: all.length, labsDone, hours: (secs / 3600).toFixed(1), mastery: topicMastery(prog, ARENA_LABS).pct };
  }, [prog]);
  const launch = (id: string) => onLaunch ? onLaunch(id) : router.push(`/lab?arena=${encodeURIComponent(id)}`);
  const history = [...prog.attempts].reverse().slice(0, 12);

  return (
    <div className={cx('mx-auto w-full max-w-[1280px] space-y-4', embedded ? 'p-4' : 'p-4 md:p-6')} data-testid="arena-home">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-action uppercase">
            <Trophy className="size-3.5" aria-hidden /> Lab Arena
          </p>
          <h1 className="text-[22px] font-semibold text-balance">Hands-on CCNA labs, graded like Packet Tracer</h1>
          <p className="max-w-[70ch] text-[13px] text-muted">Every lab loads its own network into the designer. You work in real device consoles; grading reads the running network: configuration, control plane and simulated packets. Guided labs coach you, skills assessments and troubleshooting tickets test you, and timed challenges run under exam conditions.</p>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center">
          {[
            ['Mastery', `${overall.mastery}%`],
            ['Labs passed', `${overall.labsDone}/${ARENA_LABS.length}`],
            ['Attempts', String(overall.attempts)],
            ['Hours', overall.hours],
          ].map(([k, v]) => (
            <div key={k} className="min-w-[78px] rounded-[8px] border border-line bg-pane px-3 py-2">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="text-[17px] font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <nav aria-label="CCNA lab topics" className="rounded-[8px] border border-line bg-pane p-1.5">
          <ul className="space-y-0.5">
            {ARENA_TOPICS.map((t) => {
              const m = topicMastery(prog, labsFor(t.id));
              const soon = t.status === 'soon';
              return (
                <li key={t.id}>
                  <button className={cx('flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left', t.id === topicId ? 'bg-pane-2' : 'hover:bg-pane-2/60')} onClick={() => setTopicId(t.id)} aria-current={t.id === topicId ? 'true' : undefined} data-testid={`arena-topic-${t.id}`}>
                    <span className="w-7 shrink-0 text-center font-mono text-[11.5px] text-faint">{String(t.chapter).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-[13px]', soon ? 'text-muted' : 'font-medium')}>{t.title}</span>
                      {!soon && (
                        <span className="mt-1 block h-1 overflow-hidden rounded bg-line">
                          <span className="block h-full bg-healthy" style={{ width: `${m.pct}%` }} />
                        </span>
                      )}
                    </span>
                    {soon ? <Lock className="size-3.5 text-faint" aria-label="Coming soon" /> : <span className="text-[11.5px] text-muted tabular-nums">{m.pct}%</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="min-w-0 space-y-3" aria-label={topic.title}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold">
              Chapter {topic.chapter}: {topic.title}
            </h2>
            <span className="flex flex-wrap gap-1">
              {topic.exam.map((e) => (
                <Badge key={e}>v2.0 {e}</Badge>
              ))}
            </span>
          </div>
          <p className="text-[13px] text-muted">{topic.blurb}</p>
          {topic.status === 'soon' ? (
            <div className="grid place-items-center rounded-[8px] border border-dashed border-line-strong p-10 text-center">
              <Lock className="mb-2 size-6 text-faint" aria-hidden />
              <p className="font-medium">Coming soon</p>
              <p className="max-w-[48ch] text-[12.5px] text-muted">This topic's guided labs, skills assessment, troubleshooting tickets and timed challenge are being built. VLANs and trunking is ready now.</p>
            </div>
          ) : (
            KIND_ORDER.filter((k) => labs.some((l) => l.kind === k)).map((k) => (
              <div key={k}>
                <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted uppercase">{KIND_LABEL[k]}</h3>
                <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {labs
                    .filter((l) => l.kind === k)
                    .map((l) => (
                      <LabCard key={l.id} lab={l} onLaunch={() => launch(l.id)} />
                    ))}
                </ul>
              </div>
            ))
          )}

          <div className="rounded-[8px] border border-line bg-pane">
            <h3 className="border-b border-line px-3 py-2 text-[12px] font-semibold tracking-wide text-muted uppercase">Recent attempts</h3>
            {history.length === 0 ? (
              <p className="px-3 py-4 text-[12.5px] text-muted">No attempts yet. Start with “Your first VLANs”, then try the troubleshooting tickets.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]" data-testid="arena-history">
                  <thead className="text-[11px] text-muted">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Lab</th>
                      <th className="font-medium">Score</th>
                      <th className="font-medium">Time</th>
                      <th className="font-medium">Hints</th>
                      <th className="px-3 text-right font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((a) => (
                      <tr key={`${a.labId}-${a.finishedAt}`} className="border-t border-line">
                        <td className="max-w-[340px] truncate px-3 py-1.5">{arenaLab(a.labId)?.title ?? a.labId}</td>
                        <td>
                          <Badge tone={a.pct >= 80 ? 'good' : a.pct >= 50 ? 'warn' : 'bad'}>{a.pct}%</Badge>
                        </td>
                        <td className="font-mono tabular-nums">
                          {fmtTime(a.seconds)}
                          {a.timedOut && <span className="ml-1 text-down">⏱</span>}
                        </td>
                        <td className="tabular-nums">{a.hints}</td>
                        <td className="px-3 text-right text-muted">{relTime(a.finishedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
