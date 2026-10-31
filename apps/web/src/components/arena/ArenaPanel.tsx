'use client';

import { Check, ClipboardCheck, Flag, Lightbulb, LogOut, PanelRightClose, PanelRightOpen, RotateCcw, SquareTerminal, Timer, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, cx, IconButton, Tabs, useNow } from '@/components/ui';
import { arenaLab, KIND_LABEL } from '@/lab/arena';
import { gradeArena, HINT_FACTOR } from '@/lab/arena/grade';
import { bestFor, fmtTime, useArena } from '@/lab/arena/progress';
import { activeAttempt, focusTerminal, leaveArena, setAnswer, startArena, submitArena, takeHint, useArenaUi } from '@/lab/arena/session';
import type { ArenaKind, SimletQuestion } from '@/lab/arena/types';
import { useLab } from '@/lab/store';
import { CheckResults } from './CheckResults';

type Tab = 'brief' | 'tasks' | 'addressing';
export const KIND_TONE: Record<ArenaKind, 'info' | 'good' | 'warn' | 'bad'> = { guided: 'good', skills: 'info', troubleshoot: 'warn', challenge: 'bad', simlet: 'info' };

export function Pips({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Difficulty ${n} of 3`} title={`Difficulty ${n} of 3`}>
      {[1, 2, 3].map((k) => (
        <span key={k} className={cx('h-2.5 w-1.5 rounded-sm', k <= n ? 'bg-degraded' : 'bg-line-strong')} />
      ))}
    </span>
  );
}

/** The activity window beside the canvas while an Arena lab runs. */
export function ArenaPanel({ labId }: { labId: string }) {
  const lab = arenaLab(labId)!;
  const doc = useLab((s) => s.doc!);
  const log = useLab((s) => s.log);
  const prog = useArena();
  const ui = useArenaUi();
  const now = useNow(1000);
  const [tab, setTab] = useState<Tab>('brief');
  const [collapsed, setCollapsed] = useState(false);
  const [practice, setPractice] = useState(false);
  const [confirmHint, setConfirmHint] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const active = prog.active?.labId === labId ? prog.active : undefined;
  useEffect(() => {
    if (!ui.submitted) activeAttempt(labId);
  }, [labId, ui.submitted]);
  const hinted = useMemo(() => new Set(active?.hinted ?? []), [active?.hinted]);
  const answers = useMemo(() => active?.answers ?? {}, [active?.answers]);
  const grade = useMemo(() => gradeArena(lab, doc, log, hinted, answers), [lab, doc, log, hinted, answers]);
  const simlet = lab.kind === 'simlet';
  const done = !!ui.submitted;
  const started = active ? new Date(active.startedAt).getTime() : now;
  const elapsed = done ? ui.submitted!.attempt.seconds : Math.max(0, Math.floor((now - started) / 1000));
  const limit = lab.timeLimit ? lab.timeLimit * 60 : undefined;
  const left = limit !== undefined ? Math.max(0, limit - elapsed) : undefined;
  const live = lab.kind === 'guided';
  const hintsAllowed = lab.kind !== 'challenge';
  const best = bestFor(prog, labId);

  // Timed challenge: submit automatically when the clock runs out.
  useEffect(() => {
    if (!done && left === 0 && limit) submitArena(labId, true);
  }, [left, done, limit, labId]);

  if (collapsed)
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-line bg-pane py-2 max-xl:h-10 max-xl:w-full max-xl:flex-row max-xl:justify-center max-xl:border-l-0 max-xl:border-t max-xl:py-1" aria-label="Lab activity">
        <IconButton label="Show lab activity" onClick={() => setCollapsed(false)}>
          <PanelRightOpen className="size-4" />
        </IconButton>
        <span className="text-[11px] font-semibold tabular-nums [writing-mode:vertical-rl] max-xl:[writing-mode:horizontal-tb]">{grade.completion}% complete</span>
      </aside>
    );

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-pane max-xl:relative max-xl:inset-auto max-xl:z-auto max-xl:h-[min(42vh,380px)] max-xl:max-h-[42vh] max-xl:w-full max-xl:border-l-0 max-xl:border-t max-xl:shadow-none" aria-label="Lab activity" data-testid="arena-panel">
      <header className="space-y-2 border-b border-line px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-action" aria-hidden />
          <span className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">Lab Arena</span>
          <Badge tone={KIND_TONE[lab.kind]}>{KIND_LABEL[lab.kind]}</Badge>
          <Pips n={lab.difficulty} />
          <IconButton label="Collapse lab activity" className="ml-auto size-7" onClick={() => setCollapsed(true)}>
            <PanelRightClose className="size-4" />
          </IconButton>
        </div>
        <h2 className="text-[14.5px] leading-snug font-semibold text-balance">{lab.title}</h2>
        <div className="flex items-center gap-3 text-[12.5px]">
          <span className={cx('flex items-center gap-1 font-mono tabular-nums', left !== undefined && left < 120 && !done ? 'text-down' : 'text-text')} data-testid="arena-timer" aria-live="off">
            <Timer className="size-3.5" aria-hidden />
            {left !== undefined ? `${fmtTime(left)} left` : fmtTime(elapsed)}
          </span>
          <span className="text-muted">about {lab.minutes} min</span>
          {best && <span className="ml-auto text-muted">Best {best.pct}%</span>}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11.5px] text-muted">
            <span>Completion</span>
            <span className="tabular-nums" data-testid="arena-completion">
              {done ? ui.submitted!.grade.completion : grade.completion}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-pane-2">
            <div className={cx('h-full transition-[width]', (done ? ui.submitted!.grade.completion : grade.completion) === 100 ? 'bg-healthy' : 'bg-action')} style={{ width: `${done ? ui.submitted!.grade.completion : grade.completion}%` }} />
          </div>
        </div>
        {done ? (
          <div className="rounded border border-line bg-pane-2 p-2 text-[12.5px]" role="status">
            <p className="font-medium">
              Submitted: {ui.submitted!.attempt.pct}% ({ui.submitted!.grade.score}/{ui.submitted!.grade.max}){ui.submitted!.attempt.timedOut ? ', time ran out' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="primary" onClick={() => ui.setResultsOpen(true)}>
                <ClipboardCheck className="size-3.5" /> Results and debrief
              </Button>
              <Button size="sm" onClick={() => startArena(labId)}>
                <RotateCcw className="size-3.5" /> Try again
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => (ui.terms.length ? ui.setTermOpen(!ui.termOpen) : ui.setTermOpen(true))} data-testid="arena-terminal">
              <SquareTerminal className="size-3.5" /> Terminal
            </Button>
            {lab.kind !== 'challenge' && !simlet && (
              <Button size="sm" onClick={() => setPractice(true)} data-testid="arena-check">
                <ClipboardCheck className="size-3.5" /> Check results
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => submitArena(labId)} data-testid="arena-submit">
              <Flag className="size-3.5" /> Submit attempt
            </Button>
          </div>
        )}
      </header>

      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ key: 'brief', label: 'Brief' }, { key: 'tasks', label: simlet ? `Questions (${lab.questions?.length ?? 0})` : `Tasks (${lab.items.length + lab.tests.length})` }, ...(lab.addressing ? [{ key: 'addressing' as Tab, label: 'Addressing' }] : [])]} />

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-[12.5px]">
        {tab === 'brief' && (
          <div className="space-y-3">
            <p className="leading-relaxed whitespace-pre-line" data-testid="arena-brief">
              {lab.brief}
            </p>
            <div>
              <h3 className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">You will practise</h3>
              <ul className="list-disc space-y-0.5 pl-4">
                {lab.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11.5px] text-muted">CCNA v2.0:</span>
              {lab.exam.map((e) => (
                <Badge key={e}>{e}</Badge>
              ))}
            </div>
            <p className="rounded border border-line bg-pane-2 p-2 text-muted">
              {lab.kind === 'guided' && 'Guided: tasks turn green as you complete them. Hints cost half the points of that task.'}
              {lab.kind === 'skills' && 'Skills assessment: build to the spec. Use Check results to see where you stand; only Submit records the attempt.'}
              {lab.kind === 'troubleshoot' && 'Troubleshooting: the faults are hidden. Find them with show commands, ping and traceroute. The debrief reveals them after you submit.'}
              {lab.kind === 'challenge' && 'Timed challenge: no hints, no checks. Your attempt submits itself when the clock reaches zero.'}
              {simlet && 'Simlet: configuration is locked. Open consoles, run show commands, ping and traceroute, then answer every question. Like the exam, nothing is marked until you submit. Hints cost half the points of that question.'}
            </p>
          </div>
        )}

        {tab === 'tasks' && simlet && lab.questions && (
          <ol className="space-y-3" data-testid="arena-questions">
            {lab.questions.map((q, k) => (
              <Question
                key={q.id}
                q={q}
                n={k + 1}
                chosen={done ? (ui.submitted!.grade.questions[k]?.chosen ?? []) : (answers[q.id] ?? [])}
                done={done}
                hinted={hinted.has(q.id) || !!revealed[q.id]}
                confirming={confirmHint === q.id}
                onPick={(ids) => setAnswer(labId, q.id, ids)}
                onAskHint={() => setConfirmHint(q.id)}
                onHint={() => {
                  takeHint(labId, q.id);
                  setRevealed({ ...revealed, [q.id]: true });
                  setConfirmHint(null);
                }}
                onCancelHint={() => setConfirmHint(null)}
              />
            ))}
          </ol>
        )}

        {tab === 'tasks' && !simlet && (
          <div className="space-y-3">
            <ol className="space-y-1.5" data-testid="arena-tasks">
              {lab.items.map((it, k) => {
                const r = grade.items[k];
                const show = live || done;
                const masked = lab.kind === 'troubleshoot' && !done && !r.ok && !hinted.has(it.id);
                return (
                  <li key={it.id} className={cx('rounded-[6px] border p-2', show && r.ok ? 'border-healthy/40 bg-healthy/5' : 'border-line')} data-ok={show ? r.ok : undefined}>
                    <div className="flex items-start gap-2">
                      <span className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px]', show && r.ok ? 'border-healthy bg-healthy text-white' : 'border-line-strong text-muted')}>{show && r.ok ? <Check className="size-3.5" /> : k + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-faint">{masked ? 'Hidden fault' : it.group}</p>
                        <p className={cx(masked && 'text-muted italic')}>{masked ? 'Found and fixed faults reveal themselves here.' : it.text}</p>
                        {show && !r.ok && r.detail && <p className="mt-0.5 text-[11.5px] text-degraded">Not yet: {r.detail}</p>}
                        {lab.kind === 'troubleshoot' && !done && r.ok && <p className="mt-0.5 text-[11.5px] text-healthy">Fixed</p>}
                        {(hinted.has(it.id) || revealed[it.id]) && it.hint && <p className="mt-1 rounded bg-pane-2 px-2 py-1 font-mono text-[11px]">{it.hint}</p>}
                        {confirmHint === it.id && (
                          <div className="mt-1.5 flex items-center gap-1.5 rounded border border-degraded/50 bg-degraded/10 p-1.5 text-[11.5px]">
                            Hint costs {Math.round(it.points * (1 - HINT_FACTOR))} of {it.points} points.
                            <Button
                              size="sm"
                              className="ml-auto h-6"
                              onClick={() => {
                                takeHint(labId, it.id);
                                setRevealed({ ...revealed, [it.id]: true });
                                setConfirmHint(null);
                              }}
                            >
                              Show hint
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6" onClick={() => setConfirmHint(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] whitespace-nowrap text-muted tabular-nums">{it.points} pts</span>
                      {hintsAllowed && !done && it.hint && !hinted.has(it.id) && (
                        <button className="text-muted hover:text-degraded" aria-label={`Hint for task ${k + 1}`} onClick={() => setConfirmHint(it.id)}>
                          <Lightbulb className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div>
              <h3 className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Connectivity tests</h3>
              <ul className="space-y-1">
                {lab.tests.map((t, k) => {
                  const r = grade.tests[k];
                  const show = live || done;
                  return (
                    <li key={t.id} className="flex items-center gap-2 rounded border border-line px-2 py-1.5" data-ok={show ? r.ok : undefined}>
                      <span className={cx('size-2 shrink-0 rounded-full', !show ? 'bg-line-strong' : r.ok ? 'bg-healthy' : 'bg-down')} aria-hidden />
                      <span className="flex-1">{t.label}</span>
                      <span className="text-[11px] text-muted tabular-nums">{t.points} pts</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {tab === 'addressing' && lab.addressing && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11.5px]" data-testid="arena-addressing">
              <thead className="font-sans text-[11px] text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Device</th>
                  <th className="pr-2 font-medium">Interface</th>
                  <th className="pr-2 font-medium">Address</th>
                  <th className="pr-2 font-medium">Mask</th>
                  <th className="pr-2 font-medium">Gateway</th>
                  <th className="font-medium">VLAN</th>
                </tr>
              </thead>
              <tbody>
                {lab.addressing.map((a) => (
                  <tr key={`${a.device}-${a.iface}`} className="border-t border-line align-top">
                    <td className="py-1 pr-2 font-sans">{a.device}</td>
                    <td className="pr-2">{a.iface}</td>
                    <td className="pr-2">{a.ip}</td>
                    <td className="pr-2">{a.mask}</td>
                    <td className="pr-2">{a.gateway ?? '—'}</td>
                    <td className="font-sans">{a.vlan ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-3 py-2 text-[12px]">
        <Link href="/lab?library=all" className="text-muted hover:text-text">
          Lab library
        </Link>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => startArena(labId)} data-testid="arena-restart">
          <RotateCcw className="size-3.5" /> Restart
        </Button>
        <Button size="sm" variant="ghost" onClick={leaveArena} data-testid="arena-leave">
          <LogOut className="size-3.5" /> Leave
        </Button>
      </footer>

      {practice && <CheckResults open={practice} onClose={() => (setPractice(false), focusTerminal())} lab={lab} grade={grade} final={false} mask={lab.kind === 'troubleshoot'} />}
      {done && ui.resultsOpen && <CheckResults open onClose={() => (ui.setResultsOpen(false), focusTerminal())} lab={lab} grade={ui.submitted!.grade} attempt={ui.submitted!.attempt} final />}
    </aside>
  );
}

/** One simlet question: pick answers while the lab runs; after submitting, see the key and the reasoning. */
function Question({ q, n, chosen, done, hinted, confirming, onPick, onAskHint, onHint, onCancelHint }: { q: SimletQuestion; n: number; chosen: string[]; done: boolean; hinted: boolean; confirming: boolean; onPick: (ids: string[]) => void; onAskHint: () => void; onHint: () => void; onCancelHint: () => void }) {
  const multi = q.answer.length > 1;
  const ok = done && chosen.length === q.answer.length && q.answer.every((a) => chosen.includes(a));
  const toggle = (id: string) => {
    if (done) return;
    if (!multi) return onPick([id]);
    if (chosen.includes(id)) return onPick(chosen.filter((x) => x !== id));
    if (chosen.length < q.answer.length) onPick([...chosen, id]);
  };
  return (
    <li className={cx('rounded-[6px] border p-2.5', done ? (ok ? 'border-healthy/50 bg-healthy/5' : 'border-down/40 bg-down/5') : chosen.length ? 'border-action/40' : 'border-line')} data-testid={`arena-q-${q.id}`} data-ok={done ? ok : undefined}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-mono text-[11px] text-faint">Q{n}</span>
        {q.tag && <Badge tone="info">{q.tag}</Badge>}
        <span className="ml-auto text-[11px] text-muted tabular-nums">{q.points} pts</span>
        {!done && !hinted && (
          <button className="text-muted hover:text-degraded" aria-label={`Hint for question ${n}`} onClick={onAskHint}>
            <Lightbulb className="size-4" />
          </button>
        )}
      </div>
      <p className="mb-2 font-medium">{q.prompt}</p>
      <ul className="space-y-1" role={multi ? 'group' : 'radiogroup'} aria-label={`Question ${n} options`}>
        {q.options.map((o) => {
          const picked = chosen.includes(o.id);
          const right = q.answer.includes(o.id);
          const full = multi && !picked && chosen.length >= q.answer.length;
          return (
            <li key={o.id}>
              <label className={cx('flex cursor-pointer items-start gap-2 rounded px-2 py-1.5', done ? (right ? 'bg-healthy/10' : picked ? 'bg-down/10' : '') : picked ? 'bg-action/10' : 'hover:bg-pane-2', (done || full) && 'cursor-default')}>
                <input type={multi ? 'checkbox' : 'radio'} name={`q-${q.id}`} className="mt-0.5 accent-[var(--action)]" checked={picked} disabled={done || full} onChange={() => toggle(o.id)} />
                <span className="font-mono text-[11px] text-faint uppercase">{o.id}.</span>
                <span className="flex-1">{o.text}</span>
                {done && right && <Check className="size-3.5 shrink-0 text-healthy" aria-label="Correct answer" />}
              </label>
            </li>
          );
        })}
      </ul>
      {multi && !done && <p className="mt-1 text-[11px] text-muted">Choose {q.answer.length}. Selected {chosen.length}.</p>}
      {confirming && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded border border-degraded/50 bg-degraded/10 p-1.5 text-[11.5px]">
          Hint costs {Math.round(q.points * (1 - HINT_FACTOR))} of {q.points} points.
          <Button size="sm" className="ml-auto h-6" onClick={onHint}>
            Show hint
          </Button>
          <Button size="sm" variant="ghost" className="h-6" onClick={onCancelHint}>
            Cancel
          </Button>
        </div>
      )}
      {hinted && <p className="mt-1.5 rounded bg-pane-2 px-2 py-1 font-mono text-[11px]">{q.hint}</p>}
      {done && <p className="mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">{q.explain}</p>}
    </li>
  );
}
