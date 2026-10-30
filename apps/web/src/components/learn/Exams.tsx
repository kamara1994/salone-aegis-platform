'use client';

import { Bot, Calculator, Layers, MessagesSquare, RotateCcw, Shuffle, Timer } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, cx, Tabs } from '@/components/ui';
import { updateProgress } from '@/content/progress';
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

  if (!items)
    return (
      <div className="max-w-[640px] space-y-3" data-testid="exam-setup">
        <p className="text-[13px] text-muted">The selected level chooses a matching question set. If a course has too few exact matches, nearby questions fill the exam and reinforce the same skills. The clock runs and explanations appear after marking.</p>
        <fieldset className="space-y-2" data-testid="exam-difficulty-picker">
          <legend className="text-[13px] font-medium">Exam difficulty</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {EXAM_LEVELS.map((level) => (
              <button key={level.key} type="button" role="radio" aria-checked={examDifficulty === level.key} onClick={() => setExamDifficulty(level.key)} className={cx('rounded-[6px] border p-2.5 text-left', examDifficulty === level.key ? 'border-action bg-action/10' : 'border-line hover:border-line-strong')} data-testid={`exam-level-${level.key}`}>
                <span className="block text-[13px] font-semibold">{level.label}</span>
                <span className="mt-1 block min-h-10 text-[12px] leading-5 text-muted">{level.description}</span>
                <span className="mt-1 block text-[11px] text-muted">Suggested: {level.count} questions · {level.minutes} min · {level.pass}% pass mark</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <label className="space-y-0.5">
            <span className="block text-[12px] text-muted">Course</span>
            <select className={sel} value={course} onChange={(e) => setCourse(e.target.value as ExamScope)} data-testid="exam-course">
              <ScopeOptions cert={cert} scope={scope} />
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="block text-[12px] text-muted">Questions</span>
            <select className={sel} value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="exam-count">
              {[5, 10, 20, 40].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="block text-[12px] text-muted">Time limit</span>
            <select className={sel} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} data-testid="exam-minutes">
              {[5, 10, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setStartedDifficulty(examDifficulty);
            setItems(buildExam(course, count, Math.random, examDifficulty));
            setAnswers({});
            setIdx(0);
            setLeft(minutes * 60);
            setFinished(false);
            setStartedAt(Date.now());
          }}
          data-testid="exam-start"
        >
          <Timer className="size-4" /> Start the exam
        </Button>
      </div>
    );

  if (finished) {
    const weak = [...new Map(items.filter((q, k) => answers[k] !== q.answer).map((q) => [q.topic.id, q.topic])).values()];
    const pct = Math.round((score / items.length) * 100);
    const passMark = examLevel(startedDifficulty).pass;
    return (
      <div className="max-w-[860px] space-y-3" data-testid="exam-result">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-[20px] font-semibold">
            <span data-testid="exam-score">
              {score}/{items.length}
            </span>{' '}
            ({pct}%)
          </h3>
          <Badge tone={pct >= passMark ? 'good' : pct >= passMark - 10 ? 'warn' : 'bad'}>{pct >= passMark ? `Pass · ${examLevel(startedDifficulty).label}` : pct >= passMark - 10 ? 'Nearly there' : 'Keep studying'}</Badge>
          <Button size="sm" onClick={() => setItems(null)}>
            <RotateCcw className="size-3.5" /> New exam
          </Button>
        </div>
        {weak.length > 0 && (
          <div className="rounded-[6px] border border-line p-2 text-[13px]">
            <p className="mb-1 font-medium">Study these topics next</p>
            <div className="flex flex-wrap gap-1.5">
              {weak.map((t) => (
                <button key={t.id} className="rounded border border-line px-2 py-0.5 hover:border-action" onClick={() => onStudy(t.id)} data-testid={`exam-study-${t.id}`}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <ol className="space-y-2">
          {items.map((q, k) => (
            <li key={k} className={cx('rounded-[6px] border p-2 text-[13.5px]', answers[k] === q.answer ? 'border-healthy/40' : 'border-down/40')}>
            <p className="font-medium">
                {k + 1}. {q.q}
              </p>
              <p className="text-[12.5px]">
                Your answer: {answers[k] !== undefined ? q.options[answers[k]] : 'not answered'} · Correct: {q.options[q.answer]}
              </p>
              <p className="text-[12.5px] text-muted">{q.explain}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const cur = items[idx];
  return (
    <div className="max-w-[760px] space-y-3" data-testid="exam-running">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span>
          Question {idx + 1} of {items.length}
        </span>
        <span className={cx('ml-auto rounded px-2 py-0.5 font-mono tabular-nums', left < 60 ? 'bg-down/15 text-down' : 'bg-pane-2')} data-testid="exam-clock" aria-live="off">
          {fmt(left)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1" aria-label="Questions">
        {items.map((_, k) => (
          <button key={k} onClick={() => setIdx(k)} className={cx('size-7 rounded text-[11px]', k === idx ? 'bg-action text-action-ink' : answers[k] !== undefined ? 'bg-healthy/20' : 'bg-pane-2')} aria-label={`Question ${k + 1}${answers[k] !== undefined ? ', answered' : ''}`}>
            {k + 1}
          </button>
        ))}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-[15px] font-medium">{cur.q}</legend>
        <p className="text-[11.5px] text-muted">Topic: {cur.topic.title}</p>
        {cur.options.map((o, i) => (
          <button key={i} role="radio" aria-checked={answers[idx] === i} onClick={() => setAnswers({ ...answers, [idx]: i })} className={cx('block w-full rounded-[5px] border px-3 py-1.5 text-left text-[14px]', answers[idx] === i ? 'border-action bg-action/15' : 'border-line hover:border-line-strong')} data-testid={`exam-option-${i}`}>
            <span className="mr-2 font-mono text-muted">{String.fromCharCode(65 + i)}</span>
            {o}
          </button>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          Back
        </Button>
        {idx < items.length - 1 ? (
            <Button variant="primary" onClick={() => setIdx(idx + 1)} data-testid="exam-next">
            Next
          </Button>
        ) : null}
        <Button className="ml-auto" variant={Object.keys(answers).length === items.length ? 'primary' : 'secondary'} onClick={finish} data-testid="exam-finish">
          Finish and mark ({Object.keys(answers).length}/{items.length} answered)
        </Button>
      </div>
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
