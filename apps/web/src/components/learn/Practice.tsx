'use client';

import { useMutation } from '@tanstack/react-query';
import { Bot, Check, MessagesSquare, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, cx, Field, Input, Pane, Textarea } from '@/components/ui';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';
import type { LabDoc } from '@/lab/types';
import { LearnError, learnApi, TRACKS, type AnswerResult, type InterviewSession, type Question, type QuizMode, type Track } from '@/learn/api';
import { checkDrill, makeDrill, type Drill, type DrillKind } from '@/learn/subnet';

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

export function Practice({ initialTrack }: { initialTrack?: Track }) {
  const [track, setTrack] = useState<Track>(initialTrack ?? 'ccna');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState(3);
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
  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <Pane title="Set up">
        <div className="space-y-2.5 p-3">
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
          <Field label="Topic (optional)" hint="For example OSPF, VLANs, ACLs, incident response, IAM">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Difficulty ${difficulty}/5`}>
              <input type="range" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="w-full" aria-label="Difficulty" />
            </Field>
            <Field label="Questions">
              <select className={cx(sel, 'w-full')} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of questions">
                {[5, 10, 20].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Mode">
            <div className="flex gap-1" role="radiogroup" aria-label="Mode">
              {(
                [
                  ['quiz', 'Quiz'],
                  ['exam', 'Exam (timed)'],
                  ['flashcard', 'Flashcards'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx('flex-1 rounded-[5px] border px-2 py-1.5 text-[12.5px]', mode === k ? 'border-action bg-action/15' : 'border-line text-muted')}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={useLab} onChange={(e) => setUseLab(e.target.checked)} /> Ask about my own lab design
          </label>
          <Button variant="primary" className="w-full" busy={gen.isPending} onClick={() => gen.mutate()} data-testid="learn-generate">
            <Bot className="size-4" /> Generate questions
          </Button>
          <p className="text-[11.5px] text-muted">Questions are written by the AI from the official exam objectives, never copied from real exams.</p>
        </div>
      </Pane>
      <Pane title={qs ? `${TRACKS.find((t) => t.key === track)?.label}${mode === 'exam' && !finished ? ` · ${Math.floor((Date.now() - started) / 60000)} min` : ''}` : 'Questions'}>
        <div className="p-4">
          {gen.error ? (
            <NotConnected error={gen.error} />
          ) : !qs ? (
            <p className="text-[13px] text-muted">Choose a track and generate a set. Quiz mode explains each answer as you go; exam mode grades everything at the end; flashcards show the answer when you are ready.</p>
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
                } else if (r) setScore((s) => ({ correct: s.correct + (r.correct ? 1 : 0), total: s.total + 1 }));
                setIdx(idx + 1);
              }}
            />
          ) : mode === 'exam' ? (
            gradeExam.isPending ? (
              <p className="text-muted">Grading…</p>
            ) : gradeExam.error ? (
              <NotConnected error={gradeExam.error} />
            ) : examResults ? (
              <div className="space-y-2" data-testid="learn-exam-report">
                <p className="text-[16px] font-semibold">
                  {examResults.filter((r) => r.correct).length}/{examResults.length} correct ({Math.round((examResults.filter((r) => r.correct).length / examResults.length) * 100)}%) in {Math.max(1, Math.round((Date.now() - started) / 60000))} min
                </p>
                <ul className="space-y-1.5">
                  {examResults.map((r, k) => (
                    <li key={k} className={cx('rounded border p-2 text-[13px]', r.correct ? 'border-healthy/40' : 'border-down/40')}>
                      <p className="font-medium">
                        {k + 1}. {examAnswers[k].q.prompt}
                      </p>
                      {!r.correct && r.correct_answer && <p>Answer: {r.correct_answer}</p>}
                      <p className="text-muted">{r.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          ) : (
            <div className="space-y-2">
              <p className="text-[16px] font-semibold">{mode === 'flashcard' ? `Reviewed ${qs.length} cards` : `${score.correct}/${score.total} correct`}</p>
              <Button onClick={() => gen.mutate()}>Another set</Button>
            </div>
          )}
        </div>
      </Pane>
    </div>
  );
}

// ---------------- interview ----------------

const ROLES = ['Network engineer', 'SOC analyst', 'Help desk / IT support', 'Cloud security engineer', 'Systems administrator', 'Penetration tester'];

export function Interview() {
  const [role, setRole] = useState(ROLES[0]);
  const [level, setLevel] = useState('entry');
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
  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <Pane title="Interviewer">
        <div className="space-y-2.5 p-3">
          <Field label="Role">
            <select className={cx(sel, 'w-full')} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Level">
            <select className={cx(sel, 'w-full')} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
              <option value="entry">Entry level</option>
              <option value="mid">Mid level</option>
              <option value="senior">Senior</option>
            </select>
          </Field>
          <Button variant="primary" className="w-full" busy={start.isPending} onClick={() => start.mutate()} data-testid="interview-start">
            <MessagesSquare className="size-4" /> Start interview
          </Button>
          <p className="text-[11.5px] text-muted">The AI asks technical and scenario questions with follow-ups, then scores each answer: what was strong and what an interviewer expected to hear.</p>
        </div>
      </Pane>
      <Pane title={session ? `${session.role} · ${session.level}` : 'Interview'}>
        <div className="space-y-3 p-4">
          {start.error ? (
            <NotConnected error={start.error} />
          ) : !session ? (
            <p className="text-[13px] text-muted">Pick a role and start. Answer like you would in the room; explain your reasoning.</p>
          ) : (
            <>
              {session.turns.map((t, k) => (
                <div key={k} className="space-y-1 rounded border border-line p-2.5 text-[13px]">
                  <p className="font-medium">Q: {t.question}</p>
                  <p className="whitespace-pre-wrap text-muted">A: {t.answer}</p>
                  {t.feedback && (
                    <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                      <Badge tone={t.feedback.score >= 0.7 ? 'good' : t.feedback.score >= 0.4 ? 'warn' : 'bad'}>{Math.round(t.feedback.score * 100)}%</Badge>
                      <ul className="list-disc pl-4 text-healthy">{t.feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                      <ul className="list-disc pl-4 text-degraded">{t.feedback.missing.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
              ))}
              {session.next_question ? (
                <div className="space-y-2">
                  <p className="text-[15px] font-medium">{session.next_question}</p>
                  <Textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Your answer" />
                  <Button variant="primary" disabled={!answer.trim()} busy={turn.isPending} onClick={() => turn.mutate()}>
                    Answer
                  </Button>
                  {turn.error && <NotConnected error={turn.error} />}
                </div>
              ) : (
                <p className="font-medium">Interview complete.</p>
              )}
            </>
          )}
        </div>
      </Pane>
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
  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <Pane title="Drill types">
        <div className="space-y-1.5 p-3 text-[13px]">
          {(Object.keys(DRILL_LABEL) as DrillKind[]).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} /> {DRILL_LABEL[k]}
            </label>
          ))}
          <div className="mt-2 border-t border-line pt-2 text-muted" data-testid="subnet-stats">
            {stats.right}/{stats.done} right · streak {stats.streak} (best {stats.best}) · avg {stats.done ? (stats.ms / stats.done / 1000).toFixed(1) : '0'} s
          </div>
        </div>
      </Pane>
      <Pane title="Subnetting">
        <div className="space-y-3 p-4" data-testid="subnet-drill">
          {drill && (
            <>
              <p className="font-mono text-[18px]">{drill.prompt}</p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input ref={box} value={input} onChange={(e) => setInput(e.target.value)} readOnly={verdict !== null} className="h-8 w-56 rounded-[5px] border border-line-strong bg-ink px-2.5 font-mono text-[13px] text-text focus:border-action" aria-label="Subnet answer" autoFocus />
                <Button variant="primary" type="submit" data-testid="subnet-submit">
                  {verdict === null ? 'Check' : 'Next (Enter)'}
                </Button>
              </form>
              {verdict !== null && (
                <div className={cx('rounded-[6px] border p-3 text-[13px]', verdict ? 'border-healthy/50 bg-healthy/10' : 'border-down/50 bg-down/10')} data-testid="subnet-verdict">
                  <p className="font-semibold">{verdict ? 'Correct' : `Answer: ${drill.answer}`}</p>
                  <p className="text-muted">{drill.explain}</p>
                </div>
              )}
            </>
          )}
        </div>
      </Pane>
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

