'use client';

// Practice exam studio. Built from what the best exam simulators do (Boson ExSim, UWorld, Pearson VUE),
// plus things they do not: confidence calibration, retry-missed sets, weak-topic sets, a subnet scratchpad,
// resume after refresh, and time per question.
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Brain, Check, ChevronDown, Clock, Eye, Flag, GraduationCap, LayoutGrid, NotebookPen, Pause, Play, RotateCcw, Target, Timer, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, cx } from '@/components/ui';
import { certById, certTopics, type Cert } from '@/content/certs';
import { scopeTopics, selectExamQuestions, shuffle, type ExamItem, type ExamScope } from '@/content/exam';
import { loadProgress, updateProgress } from '@/content/progress';
import { ALL_TOPICS, COURSES } from '@/content/topics';
import type { ExamDifficulty } from '@/content/topics';
import { setExamDifficulty, useLearningPreferences } from '@/state/learning';
import { useUi } from '@/state/ui';

const LEVELS: { key: ExamDifficulty; label: string; description: string; count: number; minutes: number; pass: number; c: string }[] = [
  { key: 'beginner', label: 'Beginner', description: 'Foundational concepts and clear recognition questions.', count: 5, minutes: 10, pass: 60, c: '#38d9a9' },
  { key: 'intermediate', label: 'Intermediate', description: 'Apply technical knowledge to common operational tasks.', count: 10, minutes: 15, pass: 70, c: '#ffa94d' },
  { key: 'advanced', label: 'Advanced', description: 'Multi-step scenarios, evidence interpretation and trade-offs.', count: 20, minutes: 30, pass: 80, c: '#ff6b81' },
];
const lv = (d: ExamDifficulty) => LEVELS.find((l) => l.key === d)!;
type Mode = 'exam' | 'tutor';
type Conf = 'sure' | 'unsure' | 'guess';
type Source = 'all' | 'weak' | 'missed' | 'pick';
const CONF: { k: Conf; label: string; c: string }[] = [
  { k: 'sure', label: 'Sure', c: '#38d9a9' },
  { k: 'unsure', label: 'Unsure', c: '#ffa94d' },
  { k: 'guess', label: 'Guess', c: '#ff6b81' },
];
const sel = 'h-9 w-full rounded-[10px] border border-line-strong bg-ink px-2.5 text-[13px]';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const keyOf = (q: ExamItem) => `${q.topic.id}::${q.q}`;

// Stats kept across exams: questions you missed (for "Missed before") and per-topic accuracy (for "Weak topics").
const STATS_KEY = 'aegis.exam.stats.v1';
const LIVE_KEY = 'aegis.exam.live.v1';
type Stats = { missed: string[]; topic: Record<string, { r: number; n: number }> };
const readJson = <T,>(k: string, d: T): T => {
  try {
    const v = window.localStorage.getItem(k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
};
const writeJson = (k: string, v: unknown) => {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
};
const fromKey = (k: string): ExamItem | null => {
  const [tid, q] = k.split('::');
  const t = ALL_TOPICS.find((x) => x.id === tid);
  const item = t?.quiz.find((x) => x.q === q);
  return t && item ? { ...item, topic: t } : null;
};

type Live = {
  keys: string[];
  mode: Mode;
  level: ExamDifficulty;
  answers: Record<number, number>;
  struck: Record<number, number[]>;
  conf: Record<number, Conf>;
  flags: Record<number, 1>;
  checked: Record<number, 1>;
  spent: Record<number, number>;
  idx: number;
  left: number;
  total: number;
  startedAt: number;
};

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

function Ring({ pct, size, stroke, color, pass, children }: { pct: number; size: number; stroke: number; color: string; pass?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)' }} />
        {pass !== undefined && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke + 3} stroke="var(--text)" strokeDasharray={`1.5 ${c}`} strokeDashoffset={-c * (pass / 100)} opacity="0.75" />}
      </svg>
      {children}
    </span>
  );
}

/** Small line chart of past scores with the pass line. */
function Trend({ points, pass }: { points: number[]; pass: number }) {
  if (points.length < 2) return <p className="text-[12px] text-faint">Take two exams to see your trend.</p>;
  const W = 260;
  const H = 70;
  const x = (k: number) => (k / (points.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - (v / 100) * (H - 12);
  const d = points.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" role="img" aria-label={`Recent scores: ${points.join(', ')} percent`}>
      <line x1="0" x2={W} y1={y(pass)} y2={y(pass)} stroke="currentColor" className="text-faint" strokeDasharray="3 4" strokeWidth="1" />
      <path d={`${d} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill="url(#exam-trend)" opacity="0.35" />
      <defs>
        <linearGradient id="exam-trend" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--action)" />
          <stop offset="1" stopColor="var(--action)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="var(--action)" strokeWidth="2" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px var(--action))' }} />
      {points.map((v, k) => (
        <circle key={k} cx={x(k)} cy={y(v)} r="3" fill={v >= pass ? '#38d9a9' : '#ff6b81'} />
      ))}
    </svg>
  );
}

const MASKS = [
  ['/24', '255.255.255.0', '256', '254'],
  ['/25', '255.255.255.128', '128', '126'],
  ['/26', '255.255.255.192', '64', '62'],
  ['/27', '255.255.255.224', '32', '30'],
  ['/28', '255.255.255.240', '16', '14'],
  ['/29', '255.255.255.248', '8', '6'],
  ['/30', '255.255.255.252', '4', '2'],
];

export function ExamStudio({ onStudy, scope }: { onStudy: (topicId: string) => void; scope?: ExamScope }) {
  const { examDifficulty } = useLearningPreferences();
  const cert = certById(useUi((s) => s.certId));
  const [course, setCourse] = useState<ExamScope>(scope ?? (cert ? `cert:${cert.id}` : 'networking'));
  const [count, setCount] = useState(lv(examDifficulty).count);
  const [minutes, setMinutes] = useState(lv(examDifficulty).minutes);
  const [mode, setMode] = useState<Mode>('exam');
  const [source, setSource] = useState<Source>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({ missed: [], topic: {} });
  const [history, setHistory] = useState<NonNullable<ReturnType<typeof loadProgress>['exams']>>([]);
  const [live, setLiveRaw] = useState<Live | null>(null);
  const [saved, setSaved] = useState<Live | null>(null);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [grid, setGrid] = useState(false);
  const [pad, setPad] = useState(false);
  const [tools, setTools] = useState(false);
  const [allTopics, setAllTopics] = useState(false);
  const [padText, setPadText] = useState('');
  const [review, setReview] = useState<'all' | 'wrong' | 'flagged' | 'unsure' | 'slow'>('all');
  const tick = useRef(Date.now());

  useEffect(() => {
    setStats(readJson<Stats>(STATS_KEY, { missed: [], topic: {} }));
    setHistory((loadProgress().exams ?? []).slice(-12));
    const s = readJson<Live | null>(LIVE_KEY, null);
    if (s && s.keys?.length) setSaved(s);
  }, [finished]);
  useEffect(() => {
    setCount(lv(examDifficulty).count);
    setMinutes(lv(examDifficulty).minutes);
  }, [examDifficulty]);

  const items = useMemo(() => (live ? (live.keys.map(fromKey).filter(Boolean) as ExamItem[]) : null), [live?.keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const setLive = (fn: (l: Live) => Live) =>
    setLiveRaw((l) => {
      if (!l) return l;
      const n = fn(l);
      if (!finished) writeJson(LIVE_KEY, n);
      return n;
    });

  // Course topics, and which of them are weak (under 70% across past exams, at least 2 answers).
  const courseTopics = useMemo(() => scopeTopics(course).filter((t) => t.quiz.length), [course]);
  const weakIds = courseTopics.filter((t) => {
    const s = stats.topic[t.id];
    return s && s.n >= 2 && s.r / s.n < 0.7;
  }).map((t) => t.id);
  const missedHere = stats.missed.filter((k) => courseTopics.some((t) => k.startsWith(`${t.id}::`)));

  const start = (keys?: string[], m: Mode = mode) => {
    let chosen: ExamItem[];
    if (keys) chosen = shuffle(keys.map(fromKey).filter(Boolean) as ExamItem[]);
    else {
      const topics = source === 'weak' ? courseTopics.filter((t) => weakIds.includes(t.id)) : source === 'pick' && picked.length ? courseTopics.filter((t) => picked.includes(t.id)) : courseTopics;
      if (source === 'missed') chosen = shuffle(missedHere.map(fromKey).filter(Boolean) as ExamItem[]).slice(0, count);
      else chosen = selectExamQuestions(topics.flatMap((t) => t.quiz.map((q) => ({ ...q, topic: t }))), count, examDifficulty);
    }
    if (!chosen.length) return;
    const total = keys ? Math.max(60, Math.round((minutes * 60 * chosen.length) / Math.max(1, count))) : minutes * 60;
    const l: Live = { keys: chosen.map(keyOf), mode: m, level: examDifficulty, answers: {}, struck: {}, conf: {}, flags: {}, checked: {}, spent: {}, idx: 0, left: total, total, startedAt: Date.now() };
    setFinished(false);
    setPaused(false);
    setReview('all');
    setGrid(false);
    setPadText('');
    tick.current = Date.now();
    writeJson(LIVE_KEY, l);
    setLiveRaw(l);
    setSaved(null);
  };

  // Clock and time-per-question.
  useEffect(() => {
    if (!live || finished || paused) return;
    tick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.round((now - tick.current) / 1000);
      if (dt < 1) return;
      tick.current = now;
      setLive((l) => ({ ...l, left: l.mode === 'exam' ? Math.max(0, l.left - dt) : l.left, spent: { ...l.spent, [l.idx]: (l.spent[l.idx] ?? 0) + dt } }));
    }, 1000);
    return () => clearInterval(id);
  }, [!!live, finished, paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (live && !finished && live.mode === 'exam' && live.left === 0) finish();
  }, [live?.left]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = items && live ? items.filter((q, k) => live.answers[k] === q.answer).length : 0;
  function finish() {
    if (!items || !live) return;
    setFinished(true);
    setGrid(false);
    setTools(false);
    setAllTopics(false);
    const s = items.filter((q, k) => live.answers[k] === q.answer).length;
    setReview(s < items.length ? 'wrong' : 'all');
    updateProgress((p) => {
      p.exams = [...(p.exams ?? []), { course, difficulty: live.level, score: s, total: items.length, minutes: Math.max(1, Math.round((live.total - live.left) / 60) || Math.round(Object.values(live.spent).reduce((a, b) => a + b, 0) / 60)), at: new Date().toISOString() }].slice(-100);
    });
    const st = readJson<Stats>(STATS_KEY, { missed: [], topic: {} });
    const missed = new Set(st.missed);
    items.forEach((q, k) => {
      const ok = live.answers[k] === q.answer;
      const t = st.topic[q.topic.id] ?? { r: 0, n: 0 };
      st.topic[q.topic.id] = { r: t.r + (ok ? 1 : 0), n: t.n + 1 };
      if (ok) missed.delete(keyOf(q));
      else missed.add(keyOf(q));
    });
    st.missed = [...missed].slice(-400);
    writeJson(STATS_KEY, st);
    writeJson(LIVE_KEY, null);
  }

  const pick = (i: number) => setLive((l) => (l.checked[l.idx] ? l : { ...l, answers: { ...l.answers, [l.idx]: i }, struck: { ...l.struck, [l.idx]: (l.struck[l.idx] ?? []).filter((x) => x !== i) } }));
  const strike = (i: number) => setLive((l) => {
    const cur = l.struck[l.idx] ?? [];
    return { ...l, struck: { ...l.struck, [l.idx]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] } };
  });
  const flag = () => setLive((l) => { const f = { ...l.flags }; if (f[l.idx]) delete f[l.idx]; else f[l.idx] = 1; return { ...l, flags: f }; });
  const setConf = (c: Conf) => setLive((l) => ({ ...l, conf: { ...l.conf, [l.idx]: c } }));
  const go = (i: number) => setLive((l) => ({ ...l, idx: Math.max(0, Math.min((items?.length ?? 1) - 1, i)) }));
  const check = () => setLive((l) => (l.answers[l.idx] === undefined ? l : { ...l, checked: { ...l.checked, [l.idx]: 1 } }));

  useEffect(() => {
    if (!live || finished || !items) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (paused) return;
      const k = e.key.toLowerCase();
      const n = items[live.idx].options.length;
      const opt = 'abcdef'.indexOf(k) >= 0 ? 'abcdef'.indexOf(k) : '123456'.indexOf(k);
      if (opt >= 0 && opt < n) return e.shiftKey ? strike(opt) : pick(opt);
      if (k === 'f') return flag();
      if (k === 's') return setPad((p) => !p);
      if (k === 'g') return setGrid((g) => !g);
      if (k === 'escape') {
        setTools(false);
        return setGrid(false);
      }
      if (k === 'enter' && live.mode === 'tutor' && !live.checked[live.idx]) return check();
      if (e.key === 'ArrowRight' || k === 'n' || (k === 'enter' && live.mode === 'tutor')) return go(live.idx + 1);
      if (e.key === 'ArrowLeft' || k === 'p') return go(live.idx - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ------------------------------------------------------------------ setup
  // One start card with sensible defaults. Everything optional folds under Customize.
  if (!live || !items) {
    const L = lv(examDifficulty);
    const pcts = history.map((h) => Math.round((h.score / Math.max(1, h.total)) * 100));
    const best = pcts.length ? Math.max(...pcts) : 0;
    const recent = pcts.slice(-3);
    const ready = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 0;
    const courseName = course.startsWith('cert:') ? (cert?.name ?? 'This certification') : course === 'all' ? 'All courses' : course.startsWith('topic:') ? ALL_TOPICS.find((t) => t.id === course.slice(6))?.title ?? 'Topic' : COURSES.find((c) => c.id === course)?.title ?? 'Course';
    const sourceLabel = source === 'weak' ? 'your weak topics' : source === 'missed' ? 'questions you missed before' : source === 'pick' ? `${picked.length} chosen topic${picked.length === 1 ? '' : 's'}` : 'the whole course';
    const nQs = source === 'missed' ? Math.min(count, missedHere.length) : count;
    const sources: { k: Source; label: string; hint: string; disabled?: boolean }[] = [
      { k: 'all', label: 'Whole course', hint: `${courseTopics.length} topics` },
      { k: 'weak', label: 'Weak topics', hint: weakIds.length ? `${weakIds.length} under 70%` : 'None yet', disabled: !weakIds.length },
      { k: 'missed', label: 'Missed before', hint: missedHere.length ? `${missedHere.length} questions` : 'None yet', disabled: !missedHere.length },
      { k: 'pick', label: 'Choose topics', hint: picked.length ? `${picked.length} chosen` : 'Build your own' },
    ];
    // One suggested next step, based on what you have done before.
    const suggestion = missedHere.length >= 3 && source !== 'missed'
      ? { label: `Retry the ${missedHere.length} questions you missed`, run: () => start(missedHere.slice(-count), 'tutor') }
      : weakIds.length && source !== 'weak'
        ? { label: `Practise your ${weakIds.length} weak topic${weakIds.length === 1 ? '' : 's'}`, run: () => setSource('weak') }
        : null;
    return (
      <div className="mx-auto max-w-[760px] space-y-4" data-testid="exam-setup">
        <section className="exam-start">
          {saved && (
            <div className="exam-resume" data-testid="exam-resume">
              <Clock className="size-4 shrink-0 text-action" />
              <span className="min-w-0 flex-1 text-[13px]">
                Unfinished {saved.mode === 'exam' ? 'exam' : 'tutor session'}: {Object.keys(saved.answers).length} of {saved.keys.length} answered{saved.mode === 'exam' ? `, ${fmt(saved.left)} left` : ''}
              </span>
              <Button size="sm" variant="primary" onClick={() => { tick.current = Date.now(); setFinished(false); setLiveRaw(saved); setSaved(null); }} data-testid="exam-resume-go">
                <Play className="size-3.5" /> Resume
              </Button>
              <button type="button" onClick={() => { writeJson(LIVE_KEY, null); setSaved(null); }} className="text-[12px] text-faint hover:text-text">
                Discard
              </button>
            </div>
          )}

          <p className="text-[10.5px] font-semibold tracking-[0.22em] text-faint uppercase">Practice exam · {courseName}</p>
          <h2 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.015em] text-text">
            {nQs} questions{mode === 'exam' ? <>, {minutes} minutes</> : ', no clock'}
          </h2>
          <p className="mt-1.5 text-[13.5px] text-muted">
            {L.label} level from {sourceLabel}. Pass mark {L.pass}%.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="seg !rounded-full" role="radiogroup" aria-label="Exam mode">
              {(
                [
                  ['exam', 'Exam', <Timer key="t" className="size-3.5" />],
                  ['tutor', 'Tutor', <GraduationCap key="g" className="size-3.5" />],
                ] as const
              ).map(([k, label, icon]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx('seg-btn flex items-center gap-1.5 !rounded-full !px-4', mode === k && 'is-on')} data-testid={`exam-mode-${k}`}>
                  {icon} {label}
                </button>
              ))}
            </div>
            <span className="text-[12.5px] text-faint">{mode === 'exam' ? 'Timed. Answers and explanations at the end, like the real test.' : 'No clock. Check each answer and see why straight away.'}</span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => start()} disabled={(source === 'pick' && !picked.length) || !nQs} className="exam-go" data-testid="exam-start">
              {mode === 'exam' ? 'Start exam' : 'Start tutor session'} <ArrowRight className="size-5" />
            </button>
            <button type="button" onClick={() => setPickOpen((o) => !o)} aria-expanded={pickOpen} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-muted hover:text-text" data-testid="exam-customize">
              <ChevronDown className={cx('size-4 transition-transform duration-300', pickOpen && 'rotate-180')} /> Customize
            </button>
          </div>
          {suggestion && (
            <button type="button" onClick={suggestion.run} className="mt-4 flex items-center gap-2 text-[12.5px] text-action hover:underline" data-testid="exam-suggestion">
              <Target className="size-3.5" /> Or: {suggestion.label} <ArrowRight className="size-3.5" />
            </button>
          )}

          <div className={cx('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.16,1,.3,1)]', pickOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className="min-h-0 overflow-hidden">
              <div className="mt-6 space-y-5 border-t border-line pt-5">
                <fieldset data-testid="exam-difficulty-picker">
                  <legend className="exam-label">Difficulty</legend>
                  <div className="seg" role="radiogroup" aria-label="Difficulty">
                    {LEVELS.map((level) => (
                      <button key={level.key} type="button" role="radio" aria-checked={examDifficulty === level.key} onClick={() => setExamDifficulty(level.key)} className={cx('seg-btn', examDifficulty === level.key && 'is-on')} data-testid={`exam-level-${level.key}`}>
                        {level.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12px] text-faint">{L.description}</p>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
                  <label className="space-y-1">
                    <span className="exam-label !mb-0 block">Course</span>
                    <select className={sel} value={course} onChange={(e) => { setCourse(e.target.value as ExamScope); setPicked([]); }} data-testid="exam-course">
                      <ScopeOptions cert={cert} scope={scope} />
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="exam-label !mb-0 block">Questions</span>
                    <select className={sel} value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="exam-count">
                      {[5, 10, 20, 40, 60].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={cx('space-y-1', mode === 'tutor' && 'opacity-40')}>
                    <span className="exam-label !mb-0 block">Time limit</span>
                    <select className={sel} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={mode === 'tutor'} data-testid="exam-minutes">
                      {[5, 10, 15, 20, 30, 60, 120].map((n) => (
                        <option key={n} value={n}>
                          {n} min
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <p className="exam-label">Questions from</p>
                  <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Question source">
                    {sources.map((x) => (
                      <button key={x.k} type="button" role="radio" aria-checked={source === x.k} disabled={x.disabled} onClick={() => setSource(x.k)} className={cx('exam-source', source === x.k && 'is-on')} data-testid={`exam-source-${x.k}`}>
                        <span className="text-[13px] font-semibold text-text">{x.label}</span>
                        <span className="text-[11.5px] text-faint">{x.hint}</span>
                      </button>
                    ))}
                  </div>
                  {source === 'pick' && (
                    <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-auto rounded-xl border border-line p-3">
                      {courseTopics.map((t) => {
                        const on = picked.includes(t.id);
                        const st = stats.topic[t.id];
                        return (
                          <button key={t.id} type="button" onClick={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])} className={cx('rail-chip', on && 'is-on')} title={st ? `${Math.round((st.r / st.n) * 100)}% across ${st.n} answers` : 'Not tried yet'}>
                            {on && <Check className="size-3" strokeWidth={3} />}
                            {t.title}
                            {st && <i className="ml-0.5 size-1.5 rounded-full" style={{ background: st.r / st.n >= 0.7 ? '#38d9a9' : '#ff6b81' }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {history.length > 0 && (
          <section className="exam-strip" data-testid="exam-history">
            <Ring pct={ready} size={52} stroke={5} color={ready >= L.pass ? '#38d9a9' : '#ffa94d'} pass={L.pass}>
              <span className="text-[12px] font-bold">{ready}%</span>
            </Ring>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-text">{ready >= L.pass ? 'On track to pass' : `${L.pass - ready} points to the pass mark`}</p>
              <p className="text-[12px] text-faint">
                Average of your last {recent.length} · best {best}% · {history.length} exam{history.length === 1 ? '' : 's'}
              </p>
            </div>
            {pcts.length >= 2 && (
              <div className="ml-auto hidden w-[220px] sm:block">
                <Trend points={pcts} pass={L.pass} />
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ results
  const L = lv(live.level);
  if (finished) {
    const pct = Math.round((score / items.length) * 100);
    const passed = pct >= L.pass;
    const used = Object.values(live.spent).reduce((a, b) => a + b, 0);
    const avg = Math.round(used / items.length);
    const slowCut = [...Object.values(live.spent)].sort((a, b) => b - a)[Math.min(2, items.length - 1)] ?? 0;
    const cal = { sureRight: 0, sureWrong: 0, luckyRight: 0, knownGap: 0 };
    items.forEach((q, k) => {
      const ok = live.answers[k] === q.answer;
      const c = live.conf[k];
      if (c === 'sure') ok ? cal.sureRight++ : cal.sureWrong++;
      else if (c) ok ? cal.luckyRight++ : cal.knownGap++;
    });
    const byTopic = [...items.reduce((m, q, k) => {
      const v = m.get(q.topic.id) ?? { t: q.topic, r: 0, n: 0 };
      v.n++;
      if (live.answers[k] === q.answer) v.r++;
      return m.set(q.topic.id, v);
    }, new Map<string, { t: ExamItem['topic']; r: number; n: number }>()).values()].sort((a, b) => a.r / a.n - b.r / b.n);
    const wrongKeys = items.filter((q, k) => live.answers[k] !== q.answer).map(keyOf);
    const weakest = byTopic.filter((v) => v.r < v.n).slice(0, 2).map((v) => v.t.title);
    const headline = passed
      ? pct === 100
        ? 'Perfect score. Move up a difficulty level or try a longer exam.'
        : `${pct - L.pass} points above the pass mark.${weakest.length ? ` Tidy up ${weakest.join(' and ')} to make it safe.` : ''}`
      : `${L.pass - pct} points below the ${L.pass}% pass mark.${weakest.length ? ` Fix ${weakest.join(' and ')} first.` : ''}`;
    const shown = items
      .map((q, k) => ({ q, k }))
      .filter(({ q, k }) => review === 'all' || (review === 'wrong' ? live.answers[k] !== q.answer : review === 'flagged' ? !!live.flags[k] : review === 'unsure' ? !!live.conf[k] && live.conf[k] !== 'sure' : (live.spent[k] ?? 0) >= slowCut && slowCut > 0));
    const pcts = [...history.map((h) => Math.round((h.score / Math.max(1, h.total)) * 100))];
    return (
      <div className="mx-auto max-w-[980px] space-y-5" data-testid="exam-result">
        <section className={cx('exam-hero flex flex-wrap items-center gap-6', passed ? 'is-pass' : 'is-fail')}>
          <Ring pct={pct} size={128} stroke={9} color={passed ? '#38d9a9' : '#ff6b81'} pass={L.pass}>
            <span className="text-center">
              <span className="block text-[30px] leading-none font-bold">{pct}%</span>
              <span className="text-[10.5px] text-faint">pass {L.pass}%</span>
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.22em] text-faint uppercase">
              {L.label} · {live.mode === 'exam' ? 'Exam mode' : 'Tutor mode'}
            </p>
            <h3 className="mt-1 text-[26px] font-semibold">
              {passed ? 'You passed' : pct >= L.pass - 10 ? 'Nearly there' : 'Not yet'}
              <span className="text-muted">
                {' '}
                · <span data-testid="exam-score">{score}/{items.length}</span> correct
              </span>
            </h3>
            <p className="mt-1.5 max-w-[520px] text-[14px] leading-relaxed text-text" data-testid="exam-verdict">
              {headline}
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {fmt(used)} used</span>
              <span className="flex items-center gap-1.5"><Timer className="size-3.5" /> {avg}s per question</span>
              <span className="flex items-center gap-1.5"><Flag className="size-3.5" /> {Object.keys(live.flags).length} flagged</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {wrongKeys.length > 0 && (
              <Button variant="primary" onClick={() => start(wrongKeys, 'tutor')} data-testid="exam-retry-missed">
                <RotateCcw className="size-3.5" /> Retry the {wrongKeys.length} missed
              </Button>
            )}
            <Button onClick={() => { writeJson(LIVE_KEY, null); setLiveRaw(null); setFinished(false); }}>New exam</Button>
          </div>
        </section>

        <div className={cx('grid gap-4', pcts.length >= 2 && 'md:grid-cols-3')}>
          <section className={cx('exam-panel', pcts.length >= 2 && 'md:col-span-2')}>
            <p className="exam-label">Confidence check</p>
            {Object.keys(live.conf).length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ['Knew it', cal.sureRight, '#38d9a9', 'Sure and right'],
                    ['Fix first', cal.sureWrong, '#ff6b81', 'Sure but wrong: a misconception'],
                    ['Lucky', cal.luckyRight, '#ffa94d', 'Unsure or guessed, still right'],
                    ['Known gap', cal.knownGap, '#868e96', 'Unsure and wrong'],
                  ] as const
                ).map(([label, n, c, hint]) => (
                  <div key={label} className="exam-cal" style={{ '--c': c } as CSSProperties} title={hint}>
                    <b>{n}</b>
                    <span className="text-[12px] font-semibold text-text">{label}</span>
                    <span className="text-[10.5px] text-faint">{hint}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-faint">Rate Sure / Unsure / Guess on each answer next time to see which wrong answers are real misconceptions.</p>
            )}
            {cal.sureWrong > 0 && (
              <p className="mt-3 flex items-start gap-2 text-[12.5px] text-muted">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#ff6b81]" /> {cal.sureWrong} answer{cal.sureWrong === 1 ? ' was' : 's were'} wrong while you felt sure. Those are the ones that cost points on test day: review them first.
              </p>
            )}
          </section>
          {pcts.length >= 2 && (
            <section className="exam-panel">
              <p className="exam-label flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Trend</p>
              <Trend points={pcts} pass={L.pass} />
            </section>
          )}
        </div>

        <section className="exam-panel">
          <div className="flex items-center">
            <p className="exam-label mr-auto">By topic, weakest first</p>
            {byTopic.length > 6 && (
              <button type="button" onClick={() => setAllTopics((x) => !x)} className="mb-2 text-[12px] text-faint hover:text-text">
                {allTopics ? 'Show fewer' : `Show all ${byTopic.length}`}
              </button>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
            {(allTopics ? byTopic : byTopic.slice(0, 6)).map((v) => {
              const p = v.r / v.n;
              return (
                <div key={v.t.id} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-40 truncate text-text">{v.t.title}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p * 100}%`, background: p >= L.pass / 100 ? '#38d9a9' : '#ffa94d' }} />
                  </span>
                  <span className="w-9 text-right text-faint tabular-nums">
                    {v.r}/{v.n}
                  </span>
                  {p < 1 && (
                    <button type="button" onClick={() => onStudy(v.t.id)} className="text-faint hover:text-action" title={`Study ${v.t.title}`} data-testid={`exam-study-${v.t.id}`}>
                      <BookOpen className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="exam-label !mb-0 mr-auto">Review</p>
            {(
              [
                ['all', `All ${items.length}`],
                ['wrong', `Wrong ${items.length - score}`],
                ['flagged', `Flagged ${Object.keys(live.flags).length}`],
                ['unsure', 'Unsure'],
                ['slow', 'Slowest'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setReview(k)} className={cx('toc-chip rounded-full px-3 py-1 text-[12px]', review === k ? 'is-on' : 'text-muted hover:text-text')} data-testid={`exam-review-${k}`}>
                {label}
              </button>
            ))}
          </div>
          <ol className="space-y-2">
            {shown.map(({ q, k }) => {
              const ok = live.answers[k] === q.answer;
              const c = CONF.find((x) => x.k === live.conf[k]);
              return (
                <li key={k} className={cx('exam-review', ok ? 'is-ok' : 'is-bad')}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-faint">
                    <span className="tabular-nums">Q{k + 1}</span>
                    <span>{q.topic.title}</span>
                    <span>· {live.spent[k] ?? 0}s</span>
                    {c && <span className="rounded-full px-1.5" style={{ color: c.c, background: `color-mix(in srgb, ${c.c} 14%, transparent)` }}>{c.label}</span>}
                    {live.flags[k] && <Flag className="size-3 text-[#ffa94d]" />}
                  </div>
                  <p className="mt-1 text-[14px] font-medium text-text">{q.q}</p>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o, i) => (
                      <li key={i} className={cx('flex gap-2 rounded-lg px-2 py-1 text-[12.5px]', i === q.answer ? 'bg-healthy/10 text-healthy' : i === live.answers[k] ? 'bg-down/10 text-down' : 'text-muted')}>
                        <b className="w-4 font-mono">{String.fromCharCode(65 + i)}</b>
                        <span className="flex-1">{o}</span>
                        {i === q.answer && <Check className="size-3.5" />}
                        {i === live.answers[k] && i !== q.answer && <X className="size-3.5" />}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-dashed border-line pt-2 text-[12.5px] leading-relaxed text-muted">💡 {q.explain}</p>
                </li>
              );
            })}
            {!shown.length && <p className="text-[12.5px] text-faint">Nothing in this filter.</p>}
          </ol>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ running
  const cur = items[live.idx];
  const nAnswered = Object.keys(live.answers).length;
  const isChecked = !!live.checked[live.idx];
  const struck = live.struck[live.idx] ?? [];
  const unanswered = items.length - nAnswered;
  return (
    <div className="mx-auto max-w-[980px] space-y-4" data-testid="exam-running">
      <div className="exam-bar">
        <span className="text-[13px] text-muted">
          Question <b className="text-text">{live.idx + 1}</b> of {items.length}
        </span>
        <span className="hidden text-[12px] text-faint sm:inline">
          {nAnswered} answered{Object.keys(live.flags).length ? ` · ${Object.keys(live.flags).length} flagged` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => setTools((t) => !t)} aria-expanded={tools} className={cx('exam-tool exam-tool-wide relative z-40', tools && 'is-on')} data-testid="exam-tools">
              <LayoutGrid className="size-3.5" /> Tools <ChevronDown className="size-3.5" />
            </button>
            {tools && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTools(false)} aria-hidden />
                <div className="exam-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setGrid(true); setTools(false); }} data-testid="exam-grid-open">
                    <LayoutGrid className="size-4" /> Review all questions <kbd>G</kbd>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setPad((x) => !x); setTools(false); }} data-testid="exam-pad-toggle">
                    <NotebookPen className="size-4" /> {pad ? 'Hide' : 'Show'} scratchpad <kbd>S</kbd>
                  </button>
                  {live.mode === 'exam' && (
                    <button type="button" role="menuitem" onClick={() => { setPaused((x) => !x); setTools(false); }} data-testid="exam-pause">
                      {paused ? <Play className="size-4" /> : <Pause className="size-4" />} {paused ? 'Resume' : 'Pause'} the clock
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {live.mode === 'exam' ? (
            <span className={cx('exam-clock', live.left < 60 && 'is-low')} data-testid="exam-clock" aria-live="off" style={{ '--p': `${(live.left / Math.max(1, live.total)) * 100}%` } as CSSProperties}>
              <Timer className="size-3.5" /> {fmt(live.left)}
            </span>
          ) : (
            <span className="exam-clock" data-testid="exam-clock" style={{ '--p': '0%' } as CSSProperties}>
              <GraduationCap className="size-3.5" /> Tutor
            </span>
          )}
        </div>
      </div>

      <div className={cx('grid gap-4', pad && 'lg:grid-cols-[minmax(0,1fr)_280px]')}>
        <div className="min-w-0 space-y-4">
          <ol className="exam-segs" aria-label="Questions">
            {items.map((q, k) => (
              <li key={k}>
                <button type="button" onClick={() => go(k)} data-state={k === live.idx ? 'cur' : live.checked[k] ? (live.answers[k] === q.answer ? 'right' : 'wrong') : live.answers[k] !== undefined ? 'done' : 'todo'} data-flag={live.flags[k] ? '1' : undefined} data-label={`Q${k + 1}${live.flags[k] ? ' · flagged' : ''}${live.answers[k] === undefined ? ' · not answered' : ''}`} aria-label={`Question ${k + 1}${live.answers[k] !== undefined ? ', answered' : ''}${live.flags[k] ? ', flagged' : ''}`} />
              </li>
            ))}
          </ol>

          <fieldset className={cx('exam-q relative space-y-3', paused && 'is-paused')} key={live.idx}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="flash-tag" style={{ '--hue': 'var(--action)' } as CSSProperties}>{cur.topic.title}</span>
              <span className="case-chip" style={{ '--c': lv(cur.difficulty ?? 'intermediate').c } as CSSProperties}>{lv(cur.difficulty ?? 'intermediate').label}</span>
              <span className="text-faint">{live.spent[live.idx] ?? 0}s on this question</span>
              <button type="button" onClick={flag} className={cx('exam-flag ml-auto', live.flags[live.idx] && 'is-on')} title="Flag for review (F)" aria-pressed={!!live.flags[live.idx]} data-testid="exam-flag">
                <Flag className="size-3.5" /> {live.flags[live.idx] ? 'Flagged' : 'Flag'}
              </button>
            </div>
            <legend className="sr-only">Question {live.idx + 1}</legend>
            <p className="text-[20px] leading-snug font-semibold text-text">{cur.q}</p>
            <div className="space-y-2 pt-1">
              {cur.options.map((o, i) => {
                const chosen = live.answers[live.idx] === i;
                const out = struck.includes(i);
                const right = isChecked && i === cur.answer;
                const wrong = isChecked && chosen && i !== cur.answer;
                return (
                  <div key={i} className="group relative">
                    <button role="radio" aria-checked={chosen} disabled={isChecked} onClick={() => pick(i)} onContextMenu={(e) => { e.preventDefault(); strike(i); }} className={cx('flash-opt pr-12', chosen && 'is-picked', out && 'is-struck', right && 'is-right', wrong && 'is-wrong')} data-testid={`exam-option-${i}`}>
                      <b>{String.fromCharCode(65 + i)}</b>
                      <span className="flex-1">{o}</span>
                      {right && <Check className="size-4 text-healthy" />}
                      {wrong && <X className="size-4 text-down" />}
                    </button>
                    {!isChecked && (
                      <button type="button" onClick={() => strike(i)} className={cx('exam-strike', out && 'is-on')} title={out ? 'Bring back (Shift + letter)' : 'Rule out (Shift + letter or right-click)'} aria-label={out ? `Bring back option ${String.fromCharCode(65 + i)}` : `Rule out option ${String.fromCharCode(65 + i)}`}>
                        {out ? <Eye className="size-3.5" /> : <X className="size-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {live.answers[live.idx] !== undefined && (
              <div className="flex flex-wrap items-center gap-2 pt-1" role="radiogroup" aria-label="How sure are you?">
                <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
                  <Brain className="size-3.5" /> How sure? <span className="opacity-70">(optional)</span>
                </span>
                {CONF.map((c) => (
                  <button key={c.k} type="button" role="radio" aria-checked={live.conf[live.idx] === c.k} onClick={() => setConf(c.k)} className={cx('exam-conf', live.conf[live.idx] === c.k && 'is-on')} style={{ '--c': c.c } as CSSProperties} data-testid={`exam-conf-${c.k}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {isChecked && (
              <div className={cx('subnet-verdict', live.answers[live.idx] === cur.answer ? 'is-ok' : 'is-bad')} data-testid="exam-explain">
                <p className="text-[14px] font-semibold">{live.answers[live.idx] === cur.answer ? 'Correct' : `Answer: ${String.fromCharCode(65 + cur.answer)}. ${cur.options[cur.answer]}`}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{cur.explain}</p>
              </div>
            )}
            {paused && (
              <div className="absolute inset-0 grid place-items-center rounded-[20px] bg-[color-mix(in_srgb,var(--ink)_85%,transparent)] backdrop-blur-md">
                <Button variant="primary" onClick={() => setPaused(false)}>
                  <Play className="size-4" /> Resume
                </Button>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={live.idx === 0} onClick={() => go(live.idx - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {live.mode === 'tutor' && !isChecked ? (
              <Button variant="primary" disabled={live.answers[live.idx] === undefined} onClick={check} data-testid="exam-check">
                <Target className="size-4" /> Check answer
              </Button>
            ) : live.idx < items.length - 1 ? (
              <Button variant="primary" onClick={() => go(live.idx + 1)} data-testid="exam-next">
                Next <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {nAnswered === items.length ? (
              <Button className="ml-auto" variant="primary" onClick={() => (Object.keys(live.flags).length ? setGrid(true) : finish())} data-testid="exam-finish">
                <Check className="size-4" /> {live.mode === 'exam' ? 'Finish and mark' : 'Finish'}
              </Button>
            ) : (
              <button type="button" className="ml-auto text-[12.5px] text-faint hover:text-text" onClick={() => setGrid(true)} data-testid="exam-finish">
                Finish early ({nAnswered}/{items.length} answered)
              </button>
            )}
          </div>
          {live.idx < 2 && <p className="text-center text-[11.5px] text-faint">A–D answer · Shift+A–D rule out · F flag · S scratchpad · G review grid · ← → move{live.mode === 'tutor' ? ' · Enter check' : ''}</p>}
        </div>

        {pad && (
          <aside className="exam-pad space-y-3" data-testid="exam-pad">
            <p className="exam-label !mb-0 flex items-center gap-1.5"><NotebookPen className="size-3.5" /> Scratchpad</p>
            <textarea value={padText} onChange={(e) => setPadText(e.target.value)} rows={7} className="case-input font-mono !text-[12.5px]" placeholder="Work it out here…" aria-label="Scratchpad" />
            <p className="exam-label !mb-0">Subnet table</p>
            <table className="w-full text-[11.5px] tabular-nums">
              <thead className="text-faint">
                <tr>
                  <th className="text-left font-medium">CIDR</th>
                  <th className="text-left font-medium">Mask</th>
                  <th className="text-right font-medium">Block</th>
                  <th className="text-right font-medium">Hosts</th>
                </tr>
              </thead>
              <tbody className="font-mono text-muted">
                {MASKS.map(([c, m, b, h]) => (
                  <tr key={c} className="border-t border-line/60">
                    <td className="py-0.5 text-text">{c}</td>
                    <td>{m.replace('255.255.255.', '…')}</td>
                    <td className="text-right">{b}</td>
                    <td className="text-right">{h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-mono text-[11px] text-faint">128 64 32 16 8 4 2 1</p>
          </aside>
        )}
      </div>

      {grid && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Review questions" onClick={() => setGrid(false)} data-testid="exam-grid">
          <div className="w-full max-w-[640px] rounded-[22px] border border-line bg-pane p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <h3 className="text-[18px] font-semibold">Review before you submit</h3>
              <button type="button" onClick={() => setGrid(false)} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-pane-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-muted">
              <span><b className="text-text">{nAnswered}</b> answered</span>
              <span className={cx(unanswered && 'text-[#ffa94d]')}><b>{unanswered}</b> unanswered</span>
              <span><b className="text-text">{Object.keys(live.flags).length}</b> flagged</span>
              <span><b className="text-text">{Object.values(live.conf).filter((c) => c !== 'sure').length}</b> unsure</span>
            </div>
            <div className="exam-nav mt-4">
              {items.map((q, k) => (
                <button key={k} onClick={() => { go(k); setGrid(false); }} data-state={live.checked[k] ? (live.answers[k] === q.answer ? 'right' : 'wrong') : live.answers[k] !== undefined ? 'done' : 'todo'} data-flag={live.flags[k] ? '1' : undefined}>
                  {k + 1}
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {unanswered > 0 && (
                <Button onClick={() => { const k = items.findIndex((_, i) => live.answers[i] === undefined); go(k); setGrid(false); }}>Go to first unanswered</Button>
              )}
              <Button className="ml-auto" variant="primary" onClick={finish} data-testid="exam-submit">
                Submit {live.mode === 'exam' ? 'exam' : 'session'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
