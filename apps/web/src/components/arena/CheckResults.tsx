'use client';

import { Check, ChevronRight, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';
import { Badge, cx, Dialog, Tabs } from '@/components/ui';
import { itemTree } from '@/lab/arena/grade';
import { fmtTime } from '@/lab/arena/progress';
import type { ArenaLab, Attempt, Grade } from '@/lab/arena/types';

type Tab = 'items' | 'tests' | 'questions' | 'debrief';

export function ScoreRing({ pct, size = 76, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const len = 2 * Math.PI * r;
  const tone = pct >= 80 ? 'var(--healthy)' : pct >= 50 ? 'var(--degraded)' : 'var(--down)';
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'} ${pct} percent`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(pct / 100) * len} ${len}`} />
      </svg>
      <span className="absolute text-[17px] font-semibold tabular-nums" style={{ fontSize: size / 4.4 }}>
        {pct}%
      </span>
    </div>
  );
}

/** Packet Tracer "Activity Results": score, completion, assessment tree, connectivity tests, then the debrief. */
export function CheckResults({ open, onClose, lab, grade, attempt, final, mask }: { open: boolean; onClose: () => void; lab: ArenaLab; grade: Grade; attempt?: Attempt; final: boolean; mask?: boolean }) {
  const hasQ = grade.questions.length > 0;
  const [tab, setTab] = useState<Tab>(hasQ ? 'questions' : 'items');
  const okQ = grade.questions.filter((q) => q.ok).length;
  const tree = itemTree(grade.items);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const okItems = grade.items.filter((i) => i.ok).length;
  const okTests = grade.tests.filter((t) => t.ok).length;
  return (
    <Dialog open={open} onClose={onClose} title={final ? 'Activity results' : 'Check results (practice check, not submitted)'} wide>
      <div className="space-y-4 text-[13px]" data-testid="arena-results">
        <div className="flex flex-wrap items-center gap-5">
          <ScoreRing pct={grade.pct} />
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div>
              <dt className="text-[11.5px] text-muted">Score</dt>
              <dd className="font-semibold tabular-nums" data-testid="arena-score">
                {grade.score} / {grade.max}
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-muted">Completion</dt>
              <dd className="font-semibold tabular-nums">{grade.completion}%</dd>
            </div>
            {hasQ ? (
              <div>
                <dt className="text-[11.5px] text-muted">Questions correct</dt>
                <dd className="font-semibold tabular-nums">
                  {okQ} / {grade.questions.length}
                </dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="text-[11.5px] text-muted">Assessment items</dt>
                  <dd className="font-semibold tabular-nums">
                    {okItems} / {grade.items.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-muted">Connectivity tests</dt>
                  <dd className="font-semibold tabular-nums">
                    {okTests} / {grade.tests.length}
                  </dd>
                </div>
              </>
            )}
            {attempt && (
              <>
                <div>
                  <dt className="text-[11.5px] text-muted">Time</dt>
                  <dd className="font-semibold tabular-nums">
                    {fmtTime(attempt.seconds)}
                    {attempt.timedOut && <span className="ml-1 text-down">(time up)</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-muted">Hints used</dt>
                  <dd className="font-semibold tabular-nums">{attempt.hints}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
        {!final && <p className="rounded border border-line bg-pane-2 px-3 py-2 text-muted">This is a practice check. Your attempt is only recorded when you press Submit attempt.</p>}

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            ...(hasQ ? [{ key: 'questions' as Tab, label: `Questions (${okQ}/${grade.questions.length})` }] : []),
            ...(grade.items.length ? [{ key: 'items' as Tab, label: `Assessment items (${okItems}/${grade.items.length})` }] : []),
            ...(grade.tests.length ? [{ key: 'tests' as Tab, label: `Connectivity tests (${okTests}/${grade.tests.length})` }] : []),
            ...(final ? [{ key: 'debrief' as Tab, label: 'Debrief' }] : []),
          ]}
        />

        {tab === 'items' && (
          <ul className="max-h-[46vh] space-y-1 overflow-auto pr-1" data-testid="arena-tree">
            {tree.map((g) => {
              const isOpen = openGroups[g.group] ?? g.items.some((i) => !i.ok);
              const full = g.earned === g.points;
              return (
                <li key={g.group} className="rounded-[6px] border border-line">
                  <button className="flex w-full items-center gap-2 px-2.5 py-2 text-left" onClick={() => setOpenGroups({ ...openGroups, [g.group]: !isOpen })} aria-expanded={isOpen}>
                    <ChevronRight className={cx('size-4 text-faint transition-transform', isOpen && 'rotate-90')} />
                    <span className="flex-1 font-medium">{mask && g.items.some((x) => !x.ok) ? 'Hidden faults' : g.group}</span>
                    <Badge tone={full ? 'good' : g.earned > 0 ? 'warn' : 'bad'}>
                      {g.earned}/{g.points} pts
                    </Badge>
                  </button>
                  {isOpen && (
                    <ul className="space-y-1 border-t border-line px-2.5 py-2">
                      {g.items.map((i) => (
                        <li key={i.id} className="flex items-start gap-2" data-ok={i.ok}>
                          <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full', i.ok ? 'bg-healthy text-white' : 'bg-down/80 text-white')}>{i.ok ? <Check className="size-3" /> : <X className="size-3" />}</span>
                          <div className="min-w-0 flex-1">
                            <p>{mask && !i.ok ? 'Hidden fault: not fixed yet' : i.text}</p>
                            {!i.ok && !mask && i.detail && <p className="text-[12px] text-down">{i.detail}</p>}
                          </div>
                          {i.hinted && (
                            <span className="flex items-center gap-0.5 text-[11.5px] text-degraded" title="Hint used: half points">
                              <Lightbulb className="size-3.5" /> −50%
                            </span>
                          )}
                          <span className="w-14 text-right text-[12px] tabular-nums text-muted">
                            {i.earned}/{i.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'tests' && (
          <table className="w-full text-left text-[12.5px]" data-testid="arena-tests">
            <thead className="text-[11.5px] text-muted">
              <tr>
                <th className="py-1.5 font-medium">Test</th>
                <th className="font-medium">Result</th>
                <th className="text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {grade.tests.map((t) => (
                <tr key={t.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    {t.label}
                    {!t.ok && t.detail && <p className="text-[12px] text-down">{t.detail}</p>}
                  </td>
                  <td className="py-2">
                    <Badge tone={t.ok ? 'good' : 'bad'}>{t.ok ? 'Correct' : 'Incorrect'}</Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {t.earned}/{t.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'questions' && (
          <ol className="max-h-[46vh] space-y-2 overflow-auto pr-1" data-testid="arena-question-results">
            {grade.questions.map((r, k) => {
              const q = lab.questions!.find((x) => x.id === r.id)!;
              const txt = (ids: string[]) => ids.map((id) => `${id.toUpperCase()}. ${q.options.find((o) => o.id === id)?.text ?? id}`).join('; ') || 'No answer';
              return (
                <li key={r.id} className="rounded-[6px] border border-line p-2.5" data-ok={r.ok}>
                  <div className="flex items-start gap-2">
                    <span className={cx('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full', r.ok ? 'bg-healthy text-white' : 'bg-down/80 text-white')}>{r.ok ? <Check className="size-3" /> : <X className="size-3" />}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">
                        Q{k + 1}. {q.tag ? `${q.tag}: ` : ''}
                        {q.prompt}
                      </p>
                      <p className="text-[12px]">
                        <span className="text-muted">Your answer: </span>
                        <span className={r.ok ? 'text-healthy' : 'text-down'}>{txt(r.chosen)}</span>
                      </p>
                      {!r.ok && (
                        <p className="text-[12px]">
                          <span className="text-muted">Correct: </span>
                          {txt(q.answer)}
                        </p>
                      )}
                      {final && <p className="text-[12px] leading-relaxed text-muted">{q.explain}</p>}
                    </div>
                    {r.hinted && (
                      <span className="flex items-center gap-0.5 text-[11.5px] text-degraded" title="Hint used: half points">
                        <Lightbulb className="size-3.5" /> −50%
                      </span>
                    )}
                    <span className="w-14 text-right text-[12px] tabular-nums text-muted">
                      {r.earned}/{r.points}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {tab === 'debrief' && (
          <div className="space-y-3" data-testid="arena-debrief">
            {lab.faults && (
              <div>
                <h3 className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">What was broken</h3>
                <ol className="list-decimal space-y-1 pl-5">
                  {lab.faults.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ol>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Debrief</h3>
              <p className="leading-relaxed">{lab.debrief}</p>
            </div>
            <div>
              <h3 className="mb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Verify with</h3>
              <div className="flex flex-wrap gap-1.5">
                {lab.verify.map((v) => (
                  <code key={v} className="rounded border border-line bg-pane-2 px-1.5 py-0.5 font-mono text-[12px]">
                    {v}
                  </code>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
