'use client';

import { ArrowLeft, ArrowRight, Bot, Calculator, Flag, Layers, MessagesSquare, RotateCcw, Shuffle, Timer } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge, Button, cx, Tabs } from '@/components/ui';
import { loadProgress, updateProgress } from '@/content/progress';
import { certById, certTopics, type Cert } from '@/content/certs';
import { buildExam, scopeTopics, shuffle, type ExamItem, type ExamScope } from '@/content/exam';
import type { ExamDifficulty } from '@/content/topics';
import { setExamDifficulty, useLearningPreferences } from '@/state/learning';
import { useUi } from '@/state/ui';
import { ALL_TOPICS, COURSES, type CourseId } from '@/content/topics';
export { buildExam };

type Sub = 'timed' | 'flashcards' | 'ai' | 'subnetting' | 'interview';
const sel = 'h-9 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]';

const EXAM_LEVELS: { key: ExamDifficulty; label: string; description: string; count: number; minutes: number; pass: number }[] = [
  { key: 'beginner', label: 'Beginner', description: 'Foundational concepts and clear recognition questions.', count: 5, minutes: 10, pass: 60 },
  { key: 'intermediate', label: 'Intermediate', description: 'Apply technical knowledge to common operational tasks.', count: 10, minutes: 15, pass: 70 },
  { key: 'advanced', label: 'Advanced', description: 'Multi-step scenarios, evidence interpretation, and trade-offs.', count: 20, minutes: 30, pass: 80 },
];
const LEVEL_C = ['#38d9a9', '#ffa94d', '#ff6b81'];
const examLevel = (difficulty: ExamDifficulty) => EXAM_LEVELS.find((level) => level.key === difficulty)!;

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ScopeOptions({ cert, scope }: { cert?: Cert; scope?: ExamScope }) {
  const topic = scope?.startsWith('topic:') ? ALL_TOPICS.find((t) => t.id === scope.slice(6)) : undefined;
  return (
    <>
      {topic && <option value={scope}>Topic: {topic.title}</option>}
      {cert && <option value={`cert:${cert.id}`}>{cert.name} ({certTopics(cert).length} topics)</option>}
      <option value="all">All courses</option>
      {COURSES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </>
  );
}

export function TimedExam({ onStudy, scope, initialCount = 10, initialMinutes = 10 }: { onStudy: (topicId: string) => void; scope?: ExamScope; initialCount?: number; initialMinutes?: number }) {
  const { examDifficulty } = useLearningPreferences();
  const cert = certById(useUi((s) => s.certId));
  const [course, setCourse] = useState<ExamScope>(scope ?? (cert ? `cert:${cert.id}` : 'networking'));
  const [count, setCount] = useState(() => initialCount === 10 && examDifficulty !== 'intermediate' ? examLevel(examDifficulty).count : initialCount);
  const [minutes, setMinutes] = useState(() => initialMinutes === 10 && examDifficulty !== 'intermediate' ? examLevel(examDifficulty).minutes : initialMinutes);
  const [items, setItems] = useState<ExamItem[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const [finished, setFinished] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [startedDifficulty, setStartedDifficulty] = useState<ExamDifficulty>(examDifficulty);
  const [flags, setFlags] = useState<Record<number, 1>>({});
  const [review, setReview] = useState<'all' | 'wrong' | 'flagged'>('all');
  useEffect(() => {
    if (!items || finished) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const opt = 'abcd'.indexOf(k) >= 0 ? 'abcd'.indexOf(k) : '1234'.indexOf(k);
      if (opt >= 0 && opt < items[idx].options.length) setAnswers((a) => ({ ...a, [idx]: opt }));
      else if (k === 'f') setFlags((f) => { const n = { ...f }; if (n[idx]) delete n[idx]; else n[idx] = 1; return n; });
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [items, finished, idx]);

  useEffect(() => {
    if (!items) {
      setCount(examLevel(examDifficulty).count);
      setMinutes(examLevel(examDifficulty).minutes);
    }
  }, [examDifficulty, items]);

  useEffect(() => {
    if (!items || finished) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [items, finished]);
  useEffect(() => {
    if (items && !finished && left === 0) finish();
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = items ? items.filter((q, k) => answers[k] === q.answer).length : 0;
  function finish() {
    if (!items) return;
    setFinished(true);
    const s = items.filter((q, k) => answers[k] === q.answer).length;
    updateProgress((p) => {
      p.exams = [...(p.exams ?? []), { course, difficulty: startedDifficulty, score: s, total: items.length, minutes: Math.round((Date.now() - startedAt) / 60000), at: new Date().toISOString() }].slice(-100);
    });
  }

  const [history, setHistory] = useState<NonNullable<ReturnType<typeof loadProgress>['exams']>>([]);
  useEffect(() => {
    if (!items) setHistory((loadProgress().exams ?? []).slice(-8));
  }, [items]);
  const begin = () => {
    setStartedDifficulty(examDifficulty);
    setItems(buildExam(course, count, Math.random, examDifficulty));
    setAnswers({});
    setFlags({});
    setIdx(0);
    setLeft(minutes * 60);
    setFinished(false);
    setReview('all');
    setStartedAt(Date.now());
  };

  if (!items) {
    const lv = examLevel(examDifficulty);
    return (
      <div className="mx-auto max-w-[920px] space-y-5" data-testid="exam-setup">
        <header className="exam-hero">
          <p className="text-[10.5px] font-semibold tracking-[0.22em] text-faint uppercase">Practice exam</p>
          <h2 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.01em]">Sit a timed exam, then review every answer</h2>
          <p className="mt-2 max-w-[620px] text-[13.5px] leading-relaxed text-muted">The clock runs like the real thing. Flag questions to come back to, jump around freely, and see explanations only after you mark it.</p>
        </header>
        <fieldset className="space-y-2" data-testid="exam-difficulty-picker">
          <legend className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">Difficulty</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {EXAM_LEVELS.map((level, k) => (
              <button key={level.key} type="button" role="radio" aria-checked={examDifficulty === level.key} onClick={() => setExamDifficulty(level.key)} className={cx('exam-level', examDifficulty === level.key && 'is-on')} style={{ '--c': LEVEL_C[k] } as CSSProperties} data-testid={`exam-level-${level.key}`}>
                <span className="flex items-center gap-2">
                  <span className="flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((d) => (
                      <i key={d} className={cx('h-3 w-1 rounded-full', d <= k ? 'bg-[var(--c)]' : 'bg-line')} />
                    ))}
                  </span>
                  <span className="text-[14px] font-semibold text-text">{level.label}</span>
                </span>
                <span className="mt-2 block min-h-10 text-[12.5px] leading-5 text-muted">{level.description}</span>
                <span className="mt-3 flex gap-3 text-[11.5px] text-faint">
                  <span><b className="text-text">{level.count}</b> Qs</span>
                  <span><b className="text-text">{level.minutes}</b> min</span>
                  <span><b className="text-text">{level.pass}%</b> to pass</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="exam-panel grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Course</span>
            <select className={cx(sel, 'w-full')} value={course} onChange={(e) => setCourse(e.target.value as ExamScope)} data-testid="exam-course">
              <ScopeOptions cert={cert} scope={scope} />
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Questions</span>
            <select className={cx(sel, 'w-full')} value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="exam-count">
              {[5, 10, 20, 40].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Time limit</span>
            <select className={cx(sel, 'w-full')} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} data-testid="exam-minutes">
              {[5, 10, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={begin} data-testid="exam-start">
            <Timer className="size-4" /> Start the exam
          </Button>
          <span className="text-[12px] text-faint">
            About {Math.round((minutes * 60) / Math.max(1, count))} seconds per question · pass mark {lv.pass}%
          </span>
        </div>
        {history.length > 0 && (
          <section className="exam-panel" data-testid="exam-history">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">Your recent attempts</p>
            <div className="flex h-24 items-end gap-2">
              {history.map((h, k) => {
                const pct = Math.round((h.score / Math.max(1, h.total)) * 100);
                const pass = examLevel(h.difficulty ?? 'intermediate').pass;
                return (
                  <div key={k} className="flex flex-1 flex-col items-center gap-1" title={`${h.score}/${h.total} · ${new Date(h.at).toLocaleDateString()}`}>
                    <span className="text-[10.5px] text-faint tabular-nums">{pct}%</span>
                    <span className="w-full max-w-9 rounded-t-md" style={{ height: `${Math.max(4, pct * 0.62)}px`, background: pct >= pass ? '#38d9a9' : '#ff6b81', boxShadow: `0 0 12px -2px ${pct >= pass ? '#38d9a9' : '#ff6b81'}` }} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (finished) {
    const weak = [...new Map(items.filter((q, k) => answers[k] !== q.answer).map((q) => [q.topic.id, q.topic])).values()];
    const pct = Math.round((score / items.length) * 100);
    const passMark = examLevel(startedDifficulty).pass;
    const passed = pct >= passMark;
    const byTopic = [...items.reduce((m, q, k) => {
      const v = m.get(q.topic.id) ?? { t: q.topic, r: 0, n: 0 };
      v.n++;
      if (answers[k] === q.answer) v.r++;
      return m.set(q.topic.id, v);
    }, new Map<string, { t: (typeof items)[number]['topic']; r: number; n: number }>()).values()].sort((a, b) => a.r / a.n - b.r / b.n);
    const shown = items.map((q, k) => ({ q, k })).filter(({ q, k }) => review === 'all' || (review === 'wrong' ? answers[k] !== q.answer : !!flags[k]));
    const ring = 2 * Math.PI * 52;
    return (
      <div className="mx-auto max-w-[920px] space-y-5" data-testid="exam-result">
        <section className="exam-hero flex flex-wrap items-center gap-6">
          <span className="relative grid size-[124px] place-items-center">
            <svg width="124" height="124" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="62" cy="62" r="52" fill="none" strokeWidth="9" className="stroke-line" />
              <circle cx="62" cy="62" r="52" fill="none" strokeWidth="9" strokeLinecap="round" stroke={passed ? '#38d9a9' : '#ff6b81'} strokeDasharray={ring} strokeDashoffset={ring * (1 - pct / 100)} style={{ filter: `drop-shadow(0 0 6px ${passed ? '#38d9a9' : '#ff6b81'})`, transition: 'stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)' }} />
              <circle cx="62" cy="62" r="52" fill="none" strokeWidth="11" stroke="var(--text)" strokeDasharray={`1.5 ${ring}`} strokeDashoffset={-ring * (passMark / 100)} opacity="0.7" />
            </svg>
            <span className="text-center">
              <span className="block text-[28px] leading-none font-bold">{pct}%</span>
              <span className="text-[10.5px] text-faint">pass {passMark}%</span>
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.22em] text-faint uppercase">{examLevel(startedDifficulty).label} exam</p>
            <h3 className="mt-1 text-[24px] font-semibold">
              <span data-testid="exam-score">
                {score}/{items.length}
              </span>{' '}
              correct
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={passed ? 'good' : pct >= passMark - 10 ? 'warn' : 'bad'}>{passed ? `Pass · ${examLevel(startedDifficulty).label}` : pct >= passMark - 10 ? 'Nearly there' : 'Keep studying'}</Badge>
              <span className="text-[12px] text-faint">{Math.max(1, Math.round((Date.now() - startedAt) / 60000))} min</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={begin}>
              <RotateCcw className="size-3.5" /> Retake
            </Button>
            <Button variant="primary" onClick={() => setItems(null)}>
              New exam
            </Button>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="exam-panel">
            <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">By topic</p>
            <div className="space-y-2.5">
              {byTopic.slice(0, 6).map((v) => (
                <div key={v.t.id} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-36 truncate text-text">{v.t.title}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(v.r / v.n) * 100}%`, background: v.r / v.n >= passMark / 100 ? '#38d9a9' : '#ffa94d' }} />
                  </span>
                  <span className="w-10 text-right text-faint tabular-nums">
                    {v.r}/{v.n}
                  </span>
                </div>
              ))}
            </div>
          </section>
          {weak.length > 0 && (
            <section className="exam-panel">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">Study these next</p>
              <div className="flex flex-wrap gap-1.5">
                {weak.map((t) => (
                  <button key={t.id} className="toc-chip rounded-full px-3 py-1 text-[12px] text-muted hover:text-text" onClick={() => onStudy(t.id)} data-testid={`exam-study-${t.id}`}>
                    {t.title} →
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">Review</p>
            {([['all', `All ${items.length}`], ['wrong', `Wrong ${items.length - score}`], ['flagged', `Flagged ${Object.keys(flags).length}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setReview(k)} className={cx('toc-chip rounded-full px-3 py-1 text-[12px]', review === k ? 'is-on' : 'text-muted hover:text-text')} data-testid={`exam-review-${k}`}>
                {label}
              </button>
            ))}
          </div>
          <ol className="space-y-2">
            {shown.map(({ q, k }) => {
              const ok = answers[k] === q.answer;
              return (
                <li key={k} className={cx('exam-review', ok ? 'is-ok' : 'is-bad')}>
                  <p className="flex gap-2 text-[14px] font-medium text-text">
                    <span className="text-faint tabular-nums">{k + 1}.</span>
                    <span className="flex-1">{q.q}</span>
                    {flags[k] && <Flag className="mt-0.5 size-3.5 shrink-0 text-[#ffa94d]" />}
                  </p>
                  <p className="mt-1.5 text-[12.5px]">
                    {!ok && <span className="text-down">Your answer: {answers[k] !== undefined ? q.options[answers[k]] : 'not answered'} · </span>}
                    <span className="text-healthy">Correct: {q.options[q.answer]}</span>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{q.explain}</p>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }

  const cur = items[idx];
  const nAnswered = Object.keys(answers).length;
  const total = Math.max(1, minutes * 60);
  return (
    <div className="mx-auto max-w-[920px] space-y-4" data-testid="exam-running">
      <div className="exam-bar">
        <span className="text-[13px] text-muted">
          Question <b className="text-text">{idx + 1}</b> of {items.length}
        </span>
        <span className="text-[12px] text-faint">{nAnswered} answered · {Object.keys(flags).length} flagged</span>
        <span className={cx('exam-clock ml-auto', left < 60 && 'is-low')} data-testid="exam-clock" aria-live="off" style={{ '--p': `${(left / total) * 100}%` } as CSSProperties}>
          <Timer className="size-3.5" /> {fmt(left)}
        </span>
      </div>
      <div className="exam-nav" aria-label="Questions">
        {items.map((_, k) => (
          <button key={k} onClick={() => setIdx(k)} data-state={k === idx ? 'cur' : answers[k] !== undefined ? 'done' : 'todo'} data-flag={flags[k] ? '1' : undefined} aria-label={`Question ${k + 1}${answers[k] !== undefined ? ', answered' : ''}${flags[k] ? ', flagged' : ''}`}>
            {k + 1}
          </button>
        ))}
      </div>
      <fieldset className="exam-q space-y-2.5">
        <div className="flex items-start gap-3">
          <legend className="flex-1 text-[19px] leading-snug font-semibold text-text">{cur.q}</legend>
          <button type="button" onClick={() => setFlags((f) => { const n = { ...f }; if (n[idx]) delete n[idx]; else n[idx] = 1; return n; })} className={cx('exam-flag', flags[idx] && 'is-on')} title="Flag for review (F)" aria-pressed={!!flags[idx]} data-testid="exam-flag">
            <Flag className="size-3.5" /> {flags[idx] ? 'Flagged' : 'Flag'}
          </button>
        </div>
        <p className="text-[11.5px] text-faint">Topic: {cur.topic.title}</p>
        <div className="space-y-2 pt-1">
          {cur.options.map((o, i) => (
            <button key={i} role="radio" aria-checked={answers[idx] === i} onClick={() => setAnswers({ ...answers, [idx]: i })} className={cx('flash-opt', answers[idx] === i && 'is-picked')} data-testid={`exam-option-${i}`}>
              <b>{String.fromCharCode(65 + i)}</b>
              <span className="flex-1">{o}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        {idx < items.length - 1 ? (
          <Button variant="primary" onClick={() => setIdx(idx + 1)} data-testid="exam-next">
            Next <ArrowRight className="size-4" />
          </Button>
        ) : null}
        <Button className="ml-auto" variant={nAnswered === items.length ? 'primary' : 'secondary'} onClick={finish} data-testid="exam-finish">
          Finish and mark ({nAnswered}/{items.length} answered)
        </Button>
      </div>
      <p className="text-center text-[11.5px] text-faint">A–D or 1–4 answer · F flag · ← → move</p>
    </div>
  );
}

export function Flashcards({ scope }: { scope?: ExamScope } = {}) {
  const cert = certById(useUi((s) => s.certId));
  const [course, setCourse] = useState<ExamScope>(scope ?? (cert ? `cert:${cert.id}` : 'networking'));
  const [seed, setSeed] = useState(0);
  const cards = useMemo(() => {
    const base = scopeTopics(course).flatMap((t) => t.terms.map(([term, meaning]) => ({ term, meaning, topic: t.title })));
    return seed ? shuffle(base) : base;
  }, [course, seed]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [again, setAgain] = useState<Set<string>>(new Set());
  const card = cards[i % Math.max(1, cards.length)];
  const nextCard = () => {
    setFlip(false);
    setI((x) => (x + 1) % cards.length);
  };
  if (!card) return null;
  return (
    <div className="max-w-[640px] space-y-3" data-testid="flashcards">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-0.5">
          <span className="block text-[12px] text-muted">Course</span>
          <select
            className={sel}
            value={course}
            onChange={(e) => {
              setCourse(e.target.value as ExamScope);
              setI(0);
              setFlip(false);
              setKnown(new Set());
              setAgain(new Set());
            }}
            data-testid="flash-course"
          >
            <ScopeOptions cert={cert} scope={scope} />
          </select>
        </label>
        <Button size="sm" onClick={() => (setSeed(seed + 1), setI(0), setFlip(false))}>
          <Shuffle className="size-3.5" /> Shuffle
        </Button>
        <span className="ml-auto text-[12px] text-muted" data-testid="flash-stats">
          {known.size} known · {again.size} to review · {cards.length} cards
        </span>
      </div>
      <button className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-pane p-6 text-center shadow-sm" onClick={() => setFlip(!flip)} data-testid="flash-card" aria-label={flip ? `${card.term}: ${card.meaning}` : `${card.term}. Click to reveal the meaning`}>
        {flip ? (
          <>
            <span className="text-[18px]">{card.meaning}</span>
            <span className="text-[12px] text-muted">{card.topic}</span>
          </>
        ) : (
          <>
            <span className="font-mono text-[24px] font-semibold">{card.term}</span>
            <span className="text-[12px] text-muted">Click or press space to flip</span>
          </>
        )}
      </button>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setAgain(new Set(again).add(card.term));
            known.delete(card.term);
            nextCard();
          }}
          data-testid="flash-again"
        >
          Study again
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setKnown(new Set(known).add(card.term));
            again.delete(card.term);
            nextCard();
          }}
          data-testid="flash-known"
        >
          I knew it
        </Button>
        <span className="ml-auto self-center text-[12px] text-muted">
          Card {(i % cards.length) + 1} of {cards.length}
        </span>
      </div>
    </div>
  );
}

/** Exams and practice: timed exams and flashcards from the catalog, plus AI practice, subnetting and interviews. */
export function ExamsView({ initial, onStudy, ai, subnetting, interview }: { initial?: Sub; onStudy: (topicId: string) => void; ai: ReactNode; subnetting: ReactNode; interview: ReactNode }) {
  const [sub, setSub] = useState<Sub>(initial ?? 'timed');
  return (
    <div className="space-y-3" data-testid="exams-view">
      <Tabs<Sub>
        value={sub}
        onChange={setSub}
        tabs={[
          { key: 'timed', label: <span className="flex items-center gap-1.5"><Timer className="size-4" /> Timed exam</span> },
          { key: 'flashcards', label: <span className="flex items-center gap-1.5"><Layers className="size-4" /> Flashcards</span> },
          { key: 'subnetting', label: <span className="flex items-center gap-1.5"><Calculator className="size-4" /> Subnetting drills</span> },
          { key: 'ai', label: <span className="flex items-center gap-1.5"><Bot className="size-4" /> AI practice</span> },
          { key: 'interview', label: <span className="flex items-center gap-1.5"><MessagesSquare className="size-4" /> Mock interview</span> },
        ]}
      />
      {sub === 'timed' && <TimedExam onStudy={onStudy} />}
      {sub === 'flashcards' && <Flashcards />}
      {sub === 'subnetting' && subnetting}
      {sub === 'ai' && ai}
      {sub === 'interview' && interview}
    </div>
  );
}
export type ExamsSub = Sub;
