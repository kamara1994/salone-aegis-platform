'use client';

import { useMutation } from '@tanstack/react-query';
import { Bot, Check, MessagesSquare, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, cx, Field, Input, Pane, Textarea } from '@/components/ui';
import type React from 'react';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';
import type { LabDoc } from '@/lab/types';
import { LearnError, learnApi, TRACKS, type AnswerResult, type InterviewSession, type Question, type QuizMode, type Track } from '@/learn/api';
import { checkDrill, makeDrill, type Drill, type DrillKind } from '@/learn/subnet';
import type { ExamDifficulty } from '@/content/topics';
import { setExamDifficulty, useLearningPreferences } from '@/state/learning';

const sel = 'h-9 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]';

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** A short description of the operator's saved lab design, sent with the question request when asked. */
function labSummary(): string | undefined {
  try {
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('aegis.lab.draft.v1:'));
    const doc = key ? readJson<{ doc: LabDoc }>(key)?.doc : undefined;
    if (!doc) return undefined;
    const kinds = doc.devices.reduce<Record<string, number>>((a, d) => ({ ...a, [d.kind]: (a[d.kind] ?? 0) + 1 }), {});
    const vlans = doc.vlans.map((v) => `VLAN ${v.id} ${v.name}${v.subnet ? ` ${v.subnet}` : ''}`).join('; ');
    const routers = doc.devices.filter((d) => d.kind === 'router' || d.kind === 'firewall').map((d) => `${d.name}: ${d.interfaces.filter((i) => i.ip).map((i) => `${i.name} ${i.ip}/${i.prefix}`).join(', ')}`);
    return `Devices: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}. ${vlans ? `VLANs: ${vlans}. ` : ''}${routers.length ? `L3 devices: ${routers.join(' | ')}.` : ''}`.slice(0, 1800);
  } catch {
    return undefined;
  }
}


// ---------------- shared studio layout (rail on the left, focused stage on the right) ----------------

function RailHead({ icon, eyebrow, title, hue }: { icon: React.ReactNode; eyebrow: string; title: string; hue: string }) {
  return (
    <div className="toc-head relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3" style={{ '--hue': hue } as React.CSSProperties}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${hue} 22%, transparent)`, color: hue, boxShadow: `0 0 18px -6px ${hue}` }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.22em] text-faint uppercase">{eyebrow}</p>
        <p className="text-[13px] font-medium text-text">{title}</p>
      </div>
    </div>
  );
}
function RailLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-[10.5px] font-semibold tracking-[0.18em] text-faint uppercase">{children}</p>;
}
function Seg({ children, role, label }: { children: React.ReactNode; role: string; label: string }) {
  return (
    <div className="seg" role={role} aria-label={label}>
      {children}
    </div>
  );
}
function StageHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <header className="stage-head">
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold tracking-[0.2em] text-faint uppercase">{eyebrow}</p>
        <h2 className="mt-0.5 truncate text-[18px] font-semibold text-text">{title}</h2>
      </div>
      {right}
    </header>
  );
}
function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="grid min-h-[38vh] place-items-center text-center">
      <div className="max-w-[420px]">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-pane-2 text-muted">{icon}</span>
        <p className="text-[15px] font-semibold text-text">{title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  );
}

function NotConnected({ error }: { error: unknown }) {
  const e = error instanceof LearnError ? error : new LearnError('failed', (error as Error)?.message ?? 'Unknown error');
  return (
    <div className="rounded-[6px] border border-degraded/50 bg-degraded/10 p-3 text-[13px]" role="status" data-testid="learn-ai-unavailable">
      <p className="font-semibold">{e.kind === 'mock' ? 'AI not connected (simulated lab)' : e.kind === 'not-configured' ? 'AI model not configured' : e.kind === 'not-built' ? 'Learn endpoints not on the back end yet' : 'AI request failed'}</p>
      <p className="mt-1 text-muted">{e.message}</p>
      <p className="mt-1 text-muted">Subnetting drills and lab troubleshooting below work without AI.</p>
    </div>
  );
}

// ---------------- practice (AI quiz, exam, flashcards) ----------------

function QuestionCard({ q, n, total, mode, onDone }: { q: Question; n: number; total: number; mode: QuizMode; onDone: (r: AnswerResult | null, given: string | string[] | null) => void }) {
  const [pick, setPick] = useState<string[]>([]);
  const [free, setFree] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const grade = useMutation({ mutationFn: (a: string | string[] | null) => learnApi.answer(q.id, a), onSuccess: (r) => setResult(r) });
  const given = q.type === 'free' || q.type === 'order' ? free : q.type === 'multi' ? pick : pick[0] ?? '';
  const ready = q.type === 'free' || q.type === 'order' ? free.trim().length > 0 : pick.length > 0;
  return (
    <div className="space-y-3" data-testid="learn-question">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        Question {n} of {total}
        {q.objective && <Badge>{q.objective}</Badge>}
        {q.topic && <span>{q.topic}</span>}
      </div>
      <p className="text-[15px] leading-snug whitespace-pre-wrap">{q.prompt}</p>
      {mode !== 'flashcard' && q.options && (q.type === 'single' || q.type === 'multi') && (
        <ul className="space-y-1.5">
          {q.options.map((o, k) => {
            const on = pick.includes(o);
            return (
              <li key={k}>
                <button disabled={!!result} onClick={() => setPick(q.type === 'multi' ? (on ? pick.filter((x) => x !== o) : [...pick, o]) : [o])} className={cx('w-full rounded-[6px] border px-3 py-2 text-left text-[13.5px]', on ? 'border-action bg-action/15' : 'border-line hover:border-line-strong')} aria-pressed={on}>
                  <span className="mr-2 font-mono text-muted">{String.fromCharCode(65 + k)}</span>
                  {o}
                </button>
              </li>
            );
          })}
          {q.type === 'multi' && <li className="text-[12px] text-muted">Choose all that apply.</li>}
        </ul>
      )}
      {mode !== 'flashcard' && (q.type === 'free' || q.type === 'order') && <Textarea rows={4} value={free} onChange={(e) => setFree(e.target.value)} placeholder={q.type === 'order' ? 'Write the steps in order, one per line' : 'Your answer'} disabled={!!result} aria-label="Your answer" />}
      {result ? (
        <div className={cx('rounded-[6px] border p-3 text-[13px]', result.correct ? 'border-healthy/50 bg-healthy/10' : 'border-down/50 bg-down/10')} data-testid="learn-result">
          <p className="flex items-center gap-1.5 font-semibold">{result.correct ? <Check className="size-4 text-healthy" /> : <X className="size-4 text-down" />}{mode === 'flashcard' ? 'Answer' : result.correct ? 'Correct' : `Not quite (score ${Math.round(result.score * 100)}%)`}</p>
          {result.correct_answer && <p className="mt-1">Answer: {result.correct_answer}</p>}
          <p className="mt-1 whitespace-pre-wrap text-muted">{result.explanation}</p>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => onDone(result, given)}>
            {n === total ? 'Finish' : 'Next question'}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {mode === 'flashcard' ? (
            <Button variant="primary" busy={grade.isPending} onClick={() => grade.mutate(null)}>
              Show answer
            </Button>
          ) : mode === 'exam' ? (
            <Button variant="primary" disabled={!ready} onClick={() => onDone(null, given)}>
              {n === total ? 'Submit exam' : 'Next'}
            </Button>
          ) : (
            <Button variant="primary" disabled={!ready} busy={grade.isPending} onClick={() => grade.mutate(given)} data-testid="learn-check">
              Check answer
            </Button>
          )}
        </div>
      )}
      {grade.error && <NotConnected error={grade.error} />}
    </div>
  );
}

const PRACTICE_LEVELS: { key: ExamDifficulty; label: string; detail: string; value: number }[] = [
  { key: 'beginner', label: 'Beginner', detail: 'Foundations and clear recognition', value: 1 },
  { key: 'intermediate', label: 'Intermediate', detail: 'Apply technical knowledge', value: 3 },
  { key: 'advanced', label: 'Advanced', detail: 'Multi-step analysis and decisions', value: 5 },
];

export function Practice({ initialTrack }: { initialTrack?: Track }) {
  const { examDifficulty } = useLearningPreferences();
  const [track, setTrack] = useState<Track>(initialTrack ?? 'ccna');
  const [topic, setTopic] = useState('');
  const difficulty = PRACTICE_LEVELS.find((level) => level.key === examDifficulty)!.value;
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>('quiz');
  const [useLab, setUseLab] = useState(false);
  const [qs, setQs] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [examAnswers, setExamAnswers] = useState<{ q: Question; a: string | string[] }[]>([]);
  const [examResults, setExamResults] = useState<AnswerResult[] | null>(null);
  const [started, setStarted] = useState(0);
  const gen = useMutation({
    mutationFn: () => learnApi.questions({ track, topic: topic.trim() || undefined, difficulty, count, mode, lab_summary: useLab ? labSummary() : undefined }),
    onSuccess: (r) => {
      setQs(r.questions);
      setIdx(0);
      setScore({ correct: 0, total: 0 });
      setExamAnswers([]);
      setExamResults(null);
      setStarted(Date.now());
    },
  });
  const gradeExam = useMutation({
    mutationFn: async (list: { q: Question; a: string | string[] }[]) => Promise.all(list.map((x) => learnApi.answer(x.q.id, x.a))),
    onSuccess: (r) => setExamResults(r),
  });
  const finished = qs && idx >= qs.length;
  const trackLabel = TRACKS.find((t) => t.key === track)?.label;
  const MODES: [QuizMode, string, string][] = [
    ['quiz', 'Quiz', 'Explains each answer as you go'],
    ['exam', 'Exam', 'Timed, graded at the end'],
    ['flashcard', 'Cards', 'Shows the answer when ready'],
  ];
  return (
    <div className="studio">
      <aside className="studio-rail" aria-label="AI practice set up">
        <RailHead icon={<Bot className="size-4" />} eyebrow="AI practice" title="Fresh questions on demand" hue="#7950f2" />
        <Field label="Track">
          <select className={cx(sel, 'w-full')} value={track} onChange={(e) => setTrack(e.target.value as Track)} aria-label="Track">
            {(['Certifications', 'Interviews'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {TRACKS.filter((t) => t.group === g).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Topic (optional)" hint="For example OSPF, VLANs, ACLs, IAM">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
        </Field>
        <RailLabel>{mode === 'exam' ? 'Exam difficulty' : 'Question level'}</RailLabel>
        <Seg role="radiogroup" label="AI practice difficulty">
          {PRACTICE_LEVELS.map((level) => (
            <button key={level.key} type="button" role="radio" aria-checked={examDifficulty === level.key} title={level.detail} onClick={() => setExamDifficulty(level.key)} className={cx('seg-btn', examDifficulty === level.key && 'is-on')} data-testid={`ai-level-${level.key}`}>
              {level.label}
            </button>
          ))}
        </Seg>
        <RailLabel>Questions</RailLabel>
        <Seg role="radiogroup" label="Number of questions">
          {[5, 10, 20].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCount(n)} className={cx('seg-btn', count === n && 'is-on')}>
              {n}
            </button>
          ))}
        </Seg>
        <RailLabel>Mode</RailLabel>
        <div className="space-y-1.5" role="radiogroup" aria-label="Mode">
          {MODES.map(([k, label, hint]) => (
            <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx('rail-option', mode === k && 'is-on')}>
              <span className="text-[13px] font-semibold text-text">{label}</span>
              <span className="text-[11.5px] text-faint">{hint}</span>
            </button>
          ))}
        </div>
        <label className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
          <input type="checkbox" checked={useLab} onChange={(e) => setUseLab(e.target.checked)} /> Ask about my own lab design
        </label>
        <Button variant="primary" className="w-full" busy={gen.isPending} onClick={() => gen.mutate()} data-testid="learn-generate">
          <Bot className="size-4" /> Generate questions
        </Button>
        <p className="text-[11px] leading-relaxed text-faint">Written by the AI from the official exam objectives, never copied from real exams.</p>
      </aside>
      <section className="studio-stage" aria-label="Questions">
        <StageHead eyebrow={qs ? `${trackLabel} · ${MODES.find((m) => m[0] === mode)?.[1]}` : 'Questions'} title={qs ? (finished ? 'Set complete' : `Question ${Math.min(idx + 1, qs.length)} of ${qs.length}`) : 'Generate a set to begin'} right={qs && !finished ? <span className="stage-progress" style={{ '--p': `${(idx / qs.length) * 100}%` } as React.CSSProperties} /> : null} />
        <div className="p-5">
          {gen.error ? (
            <NotConnected error={gen.error} />
          ) : !qs ? (
            <Empty icon={<Bot className="size-6" />} title="Pick a track, level and mode on the left" body="Quiz explains each answer as you go. Exam grades everything at the end. Cards show the answer when you are ready." />
          ) : !finished ? (
            <QuestionCard
              key={qs[idx].id}
              q={qs[idx]}
              n={idx + 1}
              total={qs.length}
              mode={mode}
              onDone={(r, a) => {
                if (mode === 'exam' && a !== null) {
                  const list = [...examAnswers, { q: qs[idx], a }];
                  setExamAnswers(list);
                  if (idx + 1 >= qs.length) gradeExam.mutate(list);
                } else if (r) setScore((sc) => ({ correct: sc.correct + (r.correct ? 1 : 0), total: sc.total + 1 }));
                setIdx(idx + 1);
              }}
            />
          ) : mode === 'exam' ? (
            gradeExam.isPending ? (
              <p className="text-muted">Grading…</p>
            ) : gradeExam.error ? (
              <NotConnected error={gradeExam.error} />
            ) : examResults ? (
              <div className="space-y-3" data-testid="learn-exam-report">
                <p className="text-[20px] font-semibold">
                  {examResults.filter((r) => r.correct).length}/{examResults.length} correct ({Math.round((examResults.filter((r) => r.correct).length / examResults.length) * 100)}%) in {Math.max(1, Math.round((Date.now() - started) / 60000))} min
                </p>
                <ul className="space-y-2">
                  {examResults.map((r, k) => (
                    <li key={k} className={cx('exam-review', r.correct ? 'is-ok' : 'is-bad')}>
                      <p className="text-[13.5px] font-medium text-text">
                        {k + 1}. {examAnswers[k].q.prompt}
                      </p>
                      {!r.correct && r.correct_answer && <p className="mt-1 text-[12.5px] text-healthy">Answer: {r.correct_answer}</p>}
                      <p className="mt-1 text-[12.5px] text-muted">{r.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          ) : (
            <div className="space-y-3">
              <p className="text-[22px] font-semibold">{mode === 'flashcard' ? `Reviewed ${qs.length} cards` : `${score.correct}/${score.total} correct`}</p>
              <Button variant="primary" onClick={() => gen.mutate()}>Another set</Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------- interview ----------------

const ROLES = ['Network engineer', 'SOC analyst', 'Help desk / IT support', 'Cloud security engineer', 'Systems administrator', 'Penetration tester'];

export function Interview({ initialLevel = 'entry' }: { initialLevel?: 'entry' | 'mid' | 'senior' } = {}) {
  const [role, setRole] = useState(ROLES[0]);
  const [level, setLevel] = useState<string>(initialLevel);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState('');
  const start = useMutation({ mutationFn: () => learnApi.startInterview(role, level), onSuccess: (s) => setSession({ ...s, turns: s.turns ?? [] }) });
  const turn = useMutation({
    mutationFn: () => learnApi.interviewTurn(session!.id, answer),
    onSuccess: (r) => {
      setSession((s) => (s ? { ...s, turns: [...s.turns, { question: s.next_question ?? '', answer, feedback: r.feedback }], next_question: r.next_question } : s));
      setAnswer('');
    },
  });
  const avg = session?.turns.length ? session.turns.reduce((a, t) => a + (t.feedback?.score ?? 0), 0) / session.turns.length : 0;
  return (
    <div className="studio">
      <aside className="studio-rail" aria-label="Interviewer set up">
        <RailHead icon={<MessagesSquare className="size-4" />} eyebrow="Interview mode" title="Practise answering out loud" hue="#37b24d" />
        <RailLabel>Role</RailLabel>
        <div className="space-y-1" role="radiogroup" aria-label="Role">
          {ROLES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)} className={cx('rail-row', role === r && 'is-on')}>
              <span className="rail-dot" />
              {r}
            </button>
          ))}
        </div>
        <RailLabel>Level</RailLabel>
        <Seg role="radiogroup" label="Level">
          {([['entry', 'Entry'], ['mid', 'Mid'], ['senior', 'Senior']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={level === k} onClick={() => setLevel(k)} className={cx('seg-btn', level === k && 'is-on')}>
              {label}
            </button>
          ))}
        </Seg>
        <Button variant="primary" className="w-full" busy={start.isPending} onClick={() => start.mutate()} data-testid="interview-start">
          <MessagesSquare className="size-4" /> {session ? 'Restart interview' : 'Start interview'}
        </Button>
        <p className="text-[11px] leading-relaxed text-faint">The AI asks technical and scenario questions with follow-ups, then scores each answer: what was strong and what an interviewer expected to hear.</p>
        {session && session.turns.length > 0 && (
          <div className="rail-stat">
            <span className="text-[10.5px] font-semibold tracking-[0.18em] text-faint uppercase">Average score</span>
            <b className="text-[22px]" style={{ color: avg >= 0.7 ? '#38d9a9' : avg >= 0.4 ? '#ffa94d' : '#ff6b81' }}>{Math.round(avg * 100)}%</b>
            <span className="text-[11px] text-faint">{session.turns.length} answered</span>
          </div>
        )}
      </aside>
      <section className="studio-stage" aria-label="Interview">
        <StageHead eyebrow={session ? `${session.role} · ${session.level}` : 'Interview'} title={session ? (session.next_question ? `Question ${session.turns.length + 1}` : 'Interview complete') : 'Ready when you are'} />
        <div className="space-y-4 p-5">
          {start.error ? (
            <NotConnected error={start.error} />
          ) : !session ? (
            <Empty icon={<MessagesSquare className="size-6" />} title="Pick a role and level, then start" body="Answer like you would in the room. Say what you would check, in what order, and why." />
          ) : (
            <>
              {session.turns.map((t, k) => (
                <div key={k} className="space-y-2">
                  <div className="chat-bubble is-them">
                    <span className="chat-who">Interviewer</span>
                    {t.question}
                  </div>
                  <div className="chat-bubble is-me">
                    <span className="chat-who">You</span>
                    <span className="whitespace-pre-wrap">{t.answer}</span>
                  </div>
                  {t.feedback && (
                    <div className="chat-feedback">
                      <Badge tone={t.feedback.score >= 0.7 ? 'good' : t.feedback.score >= 0.4 ? 'warn' : 'bad'}>{Math.round(t.feedback.score * 100)}%</Badge>
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[10.5px] font-semibold tracking-[0.16em] text-healthy uppercase">Strong</p>
                          <ul className="space-y-1 text-[12.5px] text-muted">{t.feedback.strengths.map((x, i) => <li key={i} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-healthy" />{x}</li>)}</ul>
                        </div>
                        <div>
                          <p className="mb-1 text-[10.5px] font-semibold tracking-[0.16em] text-degraded uppercase">Expected to hear</p>
                          <ul className="space-y-1 text-[12.5px] text-muted">{t.feedback.missing.map((x, i) => <li key={i} className="flex gap-1.5"><X className="mt-0.5 size-3.5 shrink-0 text-degraded" />{x}</li>)}</ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {session.next_question ? (
                <div className="space-y-3">
                  <div className="chat-bubble is-them is-live">
                    <span className="chat-who">Interviewer</span>
                    {session.next_question}
                  </div>
                  <Textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && answer.trim()) turn.mutate(); }} aria-label="Your answer" placeholder="Answer as you would in the room…" />
                  <div className="flex items-center gap-3">
                    <span className="text-[11.5px] text-faint">{answer.trim() ? answer.trim().split(/\s+/).length : 0} words · ⌘/Ctrl + Enter to send</span>
                    <Button className="ml-auto" variant="primary" disabled={!answer.trim()} busy={turn.isPending} onClick={() => turn.mutate()}>
                      Answer
                    </Button>
                  </div>
                  {turn.error && <NotConnected error={turn.error} />}
                </div>
              ) : (
                <p className="font-medium">Interview complete.</p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------- subnetting ----------------

const DRILL_LABEL: Record<DrillKind, string> = { network: 'Network address', broadcast: 'Broadcast', first: 'First host', last: 'Last host', hosts: 'Host count', mask: 'Mask', fit: 'Prefix for N hosts' };
const STATS_KEY = 'aegis.learn.subnet.v1';

export function Subnetting() {
  const [kinds, setKinds] = useState<DrillKind[]>(Object.keys(DRILL_LABEL) as DrillKind[]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ done: 0, right: 0, streak: 0, best: 0, ms: 0 });
  const t0 = useRef(0);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const s = readJson<typeof stats>(STATS_KEY);
    if (s) setStats(s);
    setDrill(makeDrill());
    t0.current = Date.now();
  }, []);
  const next = () => {
    setDrill(makeDrill(Math.random, kinds.length ? kinds : ['network']));
    setInput('');
    setVerdict(null);
    t0.current = Date.now();
    setTimeout(() => box.current?.focus(), 0);
  };
  const submit = () => {
    if (!drill || verdict !== null) return next();
    const ok = checkDrill(drill, input);
    setVerdict(ok);
    const s = { done: stats.done + 1, right: stats.right + (ok ? 1 : 0), streak: ok ? stats.streak + 1 : 0, best: Math.max(stats.best, ok ? stats.streak + 1 : 0), ms: stats.ms + (Date.now() - t0.current) };
    setStats(s);
    try {
      window.localStorage.setItem(STATS_KEY, JSON.stringify(s));
    } catch {
      /* storage blocked */
    }
  };
  const acc = stats.done ? stats.right / stats.done : 0;
  return (
    <div className="studio">
      <aside className="studio-rail" aria-label="Drill types">
        <RailHead icon={<span className="font-mono text-[12px] font-bold">/24</span>} eyebrow="Subnetting drills" title="Fast address maths" hue="#1098ad" />
        <div className="grid grid-cols-3 gap-2">
          <div className="rail-tile">
            <b style={{ color: acc >= 0.8 ? '#38d9a9' : acc >= 0.5 ? '#ffa94d' : 'var(--text)' }}>{Math.round(acc * 100)}%</b>
            <span>accuracy</span>
          </div>
          <div className="rail-tile">
            <b>🔥 {stats.streak}</b>
            <span>best {stats.best}</span>
          </div>
          <div className="rail-tile">
            <b>{stats.done ? (stats.ms / stats.done / 1000).toFixed(1) : '0'}s</b>
            <span>avg time</span>
          </div>
        </div>
        <p className="text-[11px] text-faint" data-testid="subnet-stats">
          {stats.right}/{stats.done} right · streak {stats.streak} (best {stats.best}) · avg {stats.done ? (stats.ms / stats.done / 1000).toFixed(1) : '0'} s
        </p>
        <RailLabel>Drill types</RailLabel>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DRILL_LABEL) as DrillKind[]).map((k) => {
            const on = kinds.includes(k);
            return (
              <label key={k} className={cx('rail-chip', on && 'is-on')}>
                <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />
                {on && <Check className="size-3" strokeWidth={3} />}
                {DRILL_LABEL[k]}
              </label>
            );
          })}
        </div>
      </aside>
      <section className="studio-stage" aria-label="Subnetting">
        <StageHead eyebrow="Subnetting" title={verdict === null ? 'Work it out' : verdict ? 'Correct' : 'Not quite'} />
        <div className="space-y-5 p-6" data-testid="subnet-drill">
          {drill && (
            <>
              <p className="subnet-prompt">{drill.prompt}</p>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input ref={box} value={input} onChange={(e) => setInput(e.target.value)} readOnly={verdict !== null} className={cx('subnet-input', verdict === true && 'is-ok', verdict === false && 'is-bad')} aria-label="Subnet answer" placeholder="Type the answer" autoFocus spellCheck={false} />
                <Button variant="primary" type="submit" data-testid="subnet-submit">
                  {verdict === null ? 'Check' : 'Next (Enter)'}
                </Button>
              </form>
              {verdict !== null && (
                <div className={cx('subnet-verdict', verdict ? 'is-ok' : 'is-bad')} data-testid="subnet-verdict">
                  <p className="flex items-center gap-2 text-[15px] font-semibold">
                    {verdict ? <Check className="size-4 text-healthy" /> : <X className="size-4 text-down" />}
                    {verdict ? 'Correct' : <>Answer: <span className="font-mono">{drill.answer}</span></>}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{drill.explain}</p>
                </div>
              )}
              <p className="text-[11.5px] text-faint">Enter to check, Enter again for the next one.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------- lab drills ----------------

export function LabDrills() {
  return (
    <div className="space-y-3">
    <Pane title="Guided CCNA and CCNP labs">
      <div className="p-3">
        <p className="mb-2 text-[13px] text-muted">Each lab builds its own topology in the lab designer and grades every task from the live network: configuration, control plane and real packets.</p>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="learn-workbooks">
          {WORKBOOKS.map((w) => (
            <li key={w.id} className="flex flex-col gap-1 rounded-[6px] border border-line p-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <Badge tone={w.level === 'CCNP' ? 'warn' : 'neutral'}>{w.level}</Badge>
                <span className="font-medium">{w.title}</span>
              </div>
              <p className="text-[12px] text-muted">
                {w.topic} · {w.tasks.length} tasks · about {w.minutes} min
              </p>
              <Link href={`/lab?workbook=${w.id}`} className="mt-auto self-start text-action hover:underline" data-testid={`open-workbook-${w.id}`}>
                Open lab
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Pane>
    <Pane title="Hands-on troubleshooting in the lab">
      <div className="p-3">
        <p className="mb-2 text-[13px] text-muted">Each drill hides one real fault in your lab design. Find it with the CLI, simulation and capture, fix it, then reveal what was changed. Graded by whether the network works, not by a guess.</p>
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="lab-drills">
          {CHALLENGES.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-[6px] border border-line p-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                <Badge>{c.level}</Badge>
                <span className="font-medium">{c.title}</span>
              </div>
              <Link href={`/lab?challenge=${c.id}`} className="mt-auto self-start text-action hover:underline" data-testid={`drill-${c.id}`}>
                Start in the lab
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Pane>
    </div>
  );
}

