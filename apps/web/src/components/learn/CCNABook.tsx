'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, ListTree, PanelLeftClose, Play, Tags } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { useBookLesson } from '@/state/bookLesson';
import { useLearningPreferences } from '@/state/learning';
import source from '@/content/books/ccna-v8.1.json';
import { vlanAccessExemplar } from '@/content/books/vlan-access-exemplar';
import { trunkExemplar } from '@/content/books/trunk-exemplar';
import { VlanAccessJourney } from '@/components/learn/VlanAccessJourney';
import { TrunkJourney } from '@/components/learn/TrunkJourney';
import { CourseLessonJourney } from '@/components/learn/CourseLessonJourney';

type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  subtitle?: string;
  beginner: { definition?: string; analogy?: string; example?: string; remember?: string; analogyParts?: { analogy: string; meaning: string }[] };
  technical: { definition?: string; explanation?: string; application?: string; remember?: string; deepDive?: string };
  why?: string;
  layerContext?: { label?: string; explanation?: string };
  wordHelp?: { term: string; meaning: string }[];
  teaching?: { problem?: string; steps?: { number?: number; text: string }[]; result?: string; method?: string; verify?: string; evidence?: { command?: string; output?: string; interpretation?: string } };
  teachingGuide?: { concept?: string; mechanism?: string; commonTrap?: string };
  masterclass?: { goal?: string; concept?: string; steps?: string[]; worked?: string; diagnosis?: string };
  depthV8?: { concept?: string; procedure?: string[]; workedExample?: string; verification?: string; commonError?: string };
  commonMistake?: string;
  learningJourney?: { kind?: string; stages?: string[] };
  navigation?: { previous?: string | null; next?: string | null };
};
type Chapter = { id: string; number: number; title: string; lessonIds: string[] };
type Book = { title: string; version: string; disclaimer?: string; qualityNotice?: string; chapters: Chapter[]; lessons: Lesson[] };

const book = source as unknown as Book;
const progressKey = 'aegis.ccna-book.v8.1';
const stageNames: Record<string, string> = {
  meaning: 'Why it matters',
  'mental-model': 'Mental model',
  mechanism: 'How it works',
  'worked-example': 'Worked example',
  verification: 'Read the evidence',
  troubleshooting: 'Troubleshooting',
  recap: 'Key takeaways',
  overview: 'Review overview',
};

function savedBookProgress(): { lessonId?: string; completed: string[] } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(progressKey) ?? '{}') as { lessonId?: string; completed?: string[] };
    return { lessonId: saved.lessonId, completed: Array.isArray(saved.completed) ? saved.completed : [] };
  } catch {
    return { completed: [] };
  }
}

/** Toolbar topic picker: type to search all lessons, grouped by chapter. */
export function BookTopicPicker() {
  const { lessonId, open } = useBookLesson();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const current = book.lessons.find((l) => l.id === lessonId);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byId = new Map(book.lessons.map((l) => [l.id, l]));
    return book.chapters
      .map((c) => ({ chapter: c, lessons: c.lessonIds.map((id) => byId.get(id)).filter((l): l is Lesson => !!l && (!q || `${l.id} ${l.title} ${c.title}`.toLowerCase().includes(q))) }))
      .filter((g) => g.lessons.length);
  }, [query]);
  useEffect(() => {
    if (!isOpen) return;
    setCompleted(savedBookProgress().completed);
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isOpen]);
  const pick = (id: string) => {
    open(id);
    setIsOpen(false);
    setQuery('');
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  return (
    <div ref={ref} className="relative" data-testid="ccna-book-picker">
      <Tags className="pointer-events-none absolute top-2 left-2 z-10 size-3.5 text-faint" aria-hidden />
      <input
        type="search"
        value={isOpen ? query : current ? `${current.id} · ${current.title}` : ''}
        onFocus={() => {
          setIsOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Enter' && groups[0]?.lessons[0]) pick(groups[0].lessons[0].id);
        }}
        placeholder={`Choose or search ${book.lessons.length} topics…`}
        aria-label="Search and choose a CCNA topic"
        aria-expanded={isOpen}
        role="combobox"
        className="h-8 w-60 rounded-[6px] border border-line-strong bg-ink pr-2 pl-7 text-[12.5px] placeholder:text-faint focus:border-action focus:outline-none lg:w-80"
        data-testid="ccna-book-topic"
      />
      {isOpen && (
        <div role="listbox" className="absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-[340px] overflow-auto rounded-[8px] border border-line-strong bg-pane p-1 shadow-xl">
          {!groups.length ? (
            <p className="px-3 py-2 text-[12px] text-muted">No matching topics.</p>
          ) : (
            groups.map((g) => (
              <div key={g.chapter.id}>
                <p className="sticky top-0 bg-pane px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-faint uppercase">
                  Chapter {g.chapter.number}: {g.chapter.title}
                </p>
                {g.lessons.map((l) => (
                  <button key={l.id} type="button" role="option" aria-selected={l.id === lessonId} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(l.id)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-text', l.id === lessonId ? 'bg-action/25' : 'hover:bg-pane-2')}>
                    <span className="w-9 shrink-0 text-faint">{l.id}</span>
                    <span className="min-w-0 flex-1">{l.title}</span>
                    {completed.includes(l.id) && <span className="text-healthy" aria-label="done">✓</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const HUES = ['#4f9cf9', '#22b8cf', '#38d9a9', '#a9e34b', '#fcc419', '#ff922b', '#ff6b6b', '#f06595', '#cc5de8', '#845ef7', '#5c7cfa'];
const hueOf = (n: number) => HUES[(n - 1) % HUES.length];

/** A small progress ring. */
function Ring({ pct, size, stroke, color, children }: { pct: number; size: number; stroke: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)', filter: pct ? `drop-shadow(0 0 3px ${color})` : undefined }} />
      </svg>
      {children}
    </span>
  );
}

/**
 * Left-hand contents for the book: chapters as an accordion with a progress ring each, lessons on a
 * glowing timeline (done, current, upcoming). Only the current chapter starts open.
 */
function BookContents({ lessonId, completed, onOpen, onHide }: { lessonId: string; completed: string[]; onOpen: (id: string) => void; onHide: () => void }) {
  const current = book.lessons.find((l) => l.id === lessonId);
  const [openCh, setOpenCh] = useState<Set<string>>(() => new Set(current ? [current.chapterId] : []));
  const currentRef = useRef<HTMLButtonElement>(null);
  const done = new Set(completed);
  const pct = book.lessons.length ? Math.round((completed.length / book.lessons.length) * 100) : 0;
  useEffect(() => {
    if (!current) return;
    setOpenCh((s) => (s.has(current.chapterId) ? s : new Set([...s, current.chapterId])));
    const t = setTimeout(() => currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
    return () => clearTimeout(t);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(book.lessons.map((l) => [l.id, l]));
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  // Next unfinished lesson after the one you are on (wrapping to the start).
  const curPos = book.lessons.findIndex((l) => l.id === lessonId);
  const nextUp = [...book.lessons.slice(curPos + 1), ...book.lessons.slice(0, curPos + 1)].find((l) => !done.has(l.id));
  // Celebrate a chapter the moment its last lesson is finished.
  const prevDone = useRef<Map<string, number> | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  useEffect(() => {
    const now = new Map(book.chapters.map((c) => [c.id, c.lessonIds.filter((id) => done.has(id)).length]));
    const before = prevDone.current;
    prevDone.current = now;
    if (!before) return;
    const finished = book.chapters.find((c) => now.get(c.id) === c.lessonIds.length && (before.get(c.id) ?? 0) < c.lessonIds.length);
    if (!finished) return;
    setBurst(finished.id);
    const t = setTimeout(() => setBurst(null), 1800);
    return () => clearTimeout(t);
  }, [completed]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className="book-toc sticky top-0 hidden h-[calc(100dvh-96px)] w-[290px] shrink-0 flex-col self-start md:flex" aria-label="Course contents" data-testid="ccna-book-contents">
      <div className="toc-head relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3">
        <Ring pct={pct} size={46} stroke={4} color="var(--action)">
          <span className="text-[11px] font-semibold">{pct}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-faint uppercase">Contents</p>
          <p className="text-[12.5px] text-text">
            <b>{completed.length}</b>
            <span className="text-muted"> / {book.lessons.length} lessons</span>
          </p>
        </div>
        <button type="button" onClick={onHide} className="grid size-7 place-items-center rounded-md text-muted hover:bg-pane-2 hover:text-text" title="Hide contents" aria-label="Hide contents" data-testid="ccna-contents-hide">
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      {nextUp && (
        <button type="button" onClick={() => onOpen(nextUp.id)} className="toc-continue group mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left" data-testid="ccna-continue">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-white shadow-[0_0_14px_var(--action)]">
            <Play className="size-3.5 translate-x-px fill-current" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-[0.18em] text-action uppercase">Continue</span>
            <span className="block truncate text-[12.5px] text-text">
              <span className="font-mono text-[11px] text-faint">{nextUp.id}</span> {nextUp.title}
            </span>
          </span>
          <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-1" />
        </button>
      )}
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Show lessons">
        {([['all', 'All'], ['todo', 'Not done'], ['done', 'Done']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={cx('toc-chip rounded-full px-2.5 py-1 text-[11.5px]', filter === k ? 'is-on' : 'text-muted hover:text-text')} data-testid={`toc-filter-${k}`}>
            {label}
          </button>
        ))}
      </div>
      <nav className="toc-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="space-y-1">
          {book.chapters.map((c) => {
            const all = c.lessonIds.map((id) => byId.get(id)).filter((l): l is Lesson => !!l);
            const doneN = all.filter((l) => done.has(l.id)).length;
            const lessons = filter === 'all' ? all : all.filter((l) => (filter === 'done') === done.has(l.id));
            if (!lessons.length) return null;
            const isOpen = filter !== 'all' || openCh.has(c.id);
            const isCurrent = current?.chapterId === c.id;
            const hue = hueOf(c.number);
            const curIdx = lessons.findIndex((l) => l.id === lessonId);
            const lastDone = lessons.reduce((m, l, i) => (done.has(l.id) ? i : m), -1);
            const reach = Math.max(curIdx, lastDone);
            return (
              <li key={c.id} className={cx('toc-chapter relative rounded-xl', isCurrent && 'is-current', burst === c.id && 'is-burst')} style={{ '--hue': hue } as React.CSSProperties}>
                {burst === c.id && (
                  <span className="toc-burst" aria-hidden>
                    {Array.from({ length: 16 }, (_, i) => (
                      <i key={i} style={{ '--a': `${(i / 16) * 360}deg`, '--r': `${34 + (i % 3) * 14}px`, '--c': i % 2 ? hue : '#fff' } as React.CSSProperties} />
                    ))}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpenCh((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left"
                  data-testid={`toc-chapter-${c.number}`}
                >
                  <Ring pct={all.length ? (doneN / all.length) * 100 : 0} size={28} stroke={2.5} color={hue}>
                    <span className="text-[10.5px] font-semibold" style={{ color: isCurrent ? hue : undefined }}>{c.number}</span>
                  </Ring>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[12.5px] leading-tight', isCurrent ? 'font-semibold text-text' : 'text-muted group-hover:text-text')}>{c.title}</span>
                    <span className="block text-[10.5px] text-faint">{doneN === all.length ? '✓ Complete' : `${doneN}/${all.length} done`}</span>
                  </span>
                  <ChevronRight className={cx('size-3.5 text-faint transition-transform duration-300', isOpen && 'rotate-90')} />
                </button>
                <div className={cx('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.16,1,.3,1)]', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="min-h-0 overflow-hidden">
                    <ol className="toc-line relative mt-0.5 mb-2 ml-[46px] pl-4" style={{ '--reach': lessons.length ? `${((reach + 0.5) / lessons.length) * 100}%` : '0%' } as React.CSSProperties}>
                      {lessons.map((l) => {
                        const on = l.id === lessonId;
                        const fin = done.has(l.id);
                        return (
                          <li key={l.id} className="relative">
                            <span className={cx('toc-node', on ? 'is-on' : fin ? 'is-done' : '')} aria-hidden>
                              {fin && !on && <Check className="size-2 text-ink" strokeWidth={4} />}
                            </span>
                            <button
                              ref={on ? currentRef : undefined}
                              type="button"
                              onClick={() => onOpen(l.id)}
                              aria-current={on ? 'page' : undefined}
                              className={cx('toc-lesson flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted', on && 'is-on')}
                              data-testid={`toc-lesson-${l.id}`}
                            >
                              <span className="w-8 shrink-0 font-mono text-[10.5px] text-faint">{l.id}</span>
                              <span className="min-w-0 flex-1 leading-snug">{l.title}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}

export function CCNABook() {
  const { teach } = useLearningPreferences();
  const lessonId = useBookLesson((b) => b.lessonId);
  const setLessonId = useBookLesson((b) => b.open);
  const [stageIndex, setStageIndex] = useState(0);
  // Furthest step reached in this lesson, so earlier steps show as seen.
  const [reached, setReached] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [toc, setTocRaw] = useState(false);
  const tocRef = useRef(false);
  tocRef.current = toc;
  const setToc = (v: boolean) => {
    setTocRaw(v);
    try { window.localStorage.setItem('aegis.book.toc', v ? '1' : '0'); } catch { /* optional */ }
  };
  useEffect(() => {
    let v: string | null = null;
    try { v = window.localStorage.getItem('aegis.book.toc'); } catch { /* optional */ }
    setTocRaw(v === null ? window.innerWidth >= 1280 : v === '1');
  }, []);
  const level = teach === 'technical' ? 'technical' : 'beginner';

  useEffect(() => {
    const saved = savedBookProgress();
    if (!useBookLesson.getState().lessonId) setLessonId(book.lessons.some((lesson) => lesson.id === saved.lessonId) ? saved.lessonId! : book.lessons[0]?.id ?? '');
    setCompleted(saved.completed);
  }, []);

  const baseLesson = book.lessons.find((entry) => entry.id === lessonId) ?? book.lessons[0];
  const lesson: Lesson | undefined = baseLesson?.id === '8.02' ? { ...baseLesson, ...vlanAccessExemplar } : baseLesson?.id === '8.04' ? { ...baseLesson, ...trunkExemplar } : baseLesson;
  const chapter = book.chapters.find((entry) => entry.id === lesson?.chapterId);
  const reviewTopics = lesson?.learningJourney?.kind === 'reading-review' && chapter
    ? chapter.lessonIds.map((id) => book.lessons.find((entry) => entry.id === id)).filter((entry): entry is Lesson => !!entry && entry.id !== lesson.id)
    : [];
  const stages = lesson?.learningJourney?.stages?.filter((entry) => entry !== 'interview' && entry !== 'assessment') ?? ['meaning', 'mental-model', 'mechanism', 'worked-example', 'verification', 'troubleshooting'];
  if (!stages.includes('recap')) stages.push('recap');
  const safeStageIndex = Math.min(stageIndex, stages.length - 1);
  const stage = stages[safeStageIndex];
  const progressPercent = book.lessons.length ? Math.round(completed.length / book.lessons.length * 100) : 0;

  useEffect(() => {
    if (!lessonId) return;
    try { window.localStorage.setItem(progressKey, JSON.stringify({ lessonId, completed })); } catch { /* local progress is optional */ }
  }, [lessonId, completed]);
  // A lesson picked from the toolbar starts at its first step.
  useEffect(() => {
    setStageIndex(0);
    setReached(0);
  }, [lessonId]);

  const openLesson = (id: string) => {
    setLessonId(id);
    setStageIndex(0);
  };
  const setStage = (index: number) => {
    const i = Math.max(0, Math.min(index, stages.length - 1));
    setStageIndex(i);
    setReached((r) => Math.max(r, i));
  };
  // Keyboard: J next lesson, K previous lesson, C show or hide the contents.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = book.lessons.findIndex((l) => l.id === useBookLesson.getState().lessonId);
      const k = e.key.toLowerCase();
      if (k === 'j' && i < book.lessons.length - 1) openLesson(book.lessons[i + 1].id);
      else if (k === 'k' && i > 0) openLesson(book.lessons[i - 1].id);
      else if (k === 'c') setToc(!tocRef.current);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lesson) return <div className="p-4 text-muted">The CCNA book could not be loaded.</div>;

  const nextLesson = lesson.navigation?.next ? book.lessons.findIndex((entry) => entry.id === lesson.navigation?.next) : -1;
  return <div className="flex min-w-0 gap-8" data-testid="ccna-course-book">
    {toc && <BookContents lessonId={lesson.id} completed={completed} onOpen={openLesson} onHide={() => setToc(false)} />}
    <div className="min-w-0 flex-1 space-y-7">
    {!toc && <button type="button" onClick={() => setToc(true)} className="toc-open hidden items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-[12px] text-muted hover:text-text md:inline-flex" data-testid="ccna-contents-show"><ListTree className="size-4" /> Contents</button>}

    <main className="book-prose min-w-0 space-y-7" data-testid="ccna-book-reader">
      <header>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted"><span>Chapter {chapter?.number ?? '—'} of {book.chapters.length}</span><span>·</span><span>Lesson {lesson.id}</span><span className="ml-auto rounded border border-line px-2 py-1">{level === 'beginner' ? 'Beginner' : 'Technical / Expert'}</span></div>
        {lesson.id === '8.02' && <p className="mt-2 text-[12px] font-semibold text-action">CCNA v1.1 · 2.1.a Access ports · 2.1.b Default VLAN</p>}
        {lesson.id === '8.04' && <p className="mt-2 text-[12px] font-semibold text-action">CCNA v1.1 · 2.2.a Trunk ports · 2.2.b 802.1Q</p>}
        <h1 className="book-title" data-testid="ccna-book-title">{lesson.title}</h1>
        {lesson.subtitle && lesson.subtitle !== lesson.why && <p className="book-sub">{lesson.subtitle}</p>}
      </header>

      <nav className="book-stepper sticky top-0 z-10" aria-label="Lesson steps" data-testid="ccna-book-stepper">
        <div className="flex items-baseline gap-4">
          <p className="text-[12.5px] text-muted">
            Step <b className="text-text">{safeStageIndex + 1}</b> of {stages.length}
            <span className="mx-1.5 text-faint">·</span>
            <span className="font-semibold text-text">{stageNames[stages[safeStageIndex]] ?? stages[safeStageIndex]}</span>
          </p>
          {safeStageIndex < stages.length - 1 && <p className="hidden text-[11.5px] text-faint sm:block">Next: {stageNames[stages[safeStageIndex + 1]] ?? stages[safeStageIndex + 1]}</p>}
        </div>
        <ol className="book-segments">
          {stages.map((name, index) => {
            const state = index === safeStageIndex ? 'current' : index <= reached ? 'done' : 'todo';
            return (
              <li key={`${name}-${index}`}>
                <button type="button" onClick={() => setStage(index)} aria-current={index === safeStageIndex ? 'step' : undefined} aria-label={`Step ${index + 1}: ${stageNames[name] ?? name}${state === 'done' ? ' (seen)' : ''}`} data-state={state} data-label={`${index + 1}. ${stageNames[name] ?? name}`} data-testid={`ccna-book-stage-${name}`} />
              </li>
            );
          })}
        </ol>
      </nav>

      <article className="space-y-5" aria-live="polite">
        {lesson.id === '8.02' && <VlanAccessJourney stage={stage} level={level} />}
        {lesson.id === '8.04' && <TrunkJourney stage={stage} level={level} />}
        {lesson.id !== '8.02' && lesson.id !== '8.04' && <CourseLessonJourney lesson={lesson} stage={stage} level={level} reviewTopics={reviewTopics} />}
        {stage === 'recap' && <div className="flex items-center gap-3 rounded-lg border border-line-strong bg-pane p-4"><Button type="button" variant="primary" onClick={() => setCompleted((current) => current.includes(lesson.id) ? current : [...current, lesson.id])}>{completed.includes(lesson.id) ? 'Lesson read' : 'Mark lesson read'}</Button><span className="text-[13px] text-muted">Reading progress only. Practice and scenario questions are in their own Learn sections.</span></div>}
      </article>

      <footer className="flex items-center justify-between pt-2">
        <Button type="button" variant="secondary" onClick={() => safeStageIndex > 0 ? setStage(safeStageIndex - 1) : lesson.navigation?.previous && openLesson(lesson.navigation.previous)} disabled={safeStageIndex === 0 && !lesson.navigation?.previous}><ArrowLeft className="size-4" />Back</Button>
        <span className="hidden text-[12px] text-muted sm:inline">Progress saves on this computer</span>
        {safeStageIndex < stages.length - 1 ? <Button type="button" variant="primary" onClick={() => setStage(safeStageIndex + 1)}>Next <ArrowRight className="size-4" /></Button> : lesson.navigation?.next && nextLesson >= 0 ? <Button type="button" variant="primary" onClick={() => openLesson(lesson.navigation!.next!)}>Next lesson <ArrowRight className="size-4" /></Button> : <Button type="button" variant="primary" onClick={() => openLesson(book.lessons[0].id)}><BookOpen className="size-4" />Back to start</Button>}
      </footer>
      <section className="pt-2 text-[12px] text-muted" aria-label="Course quality notice"><p className="font-semibold text-text">Study draft · independent educational content</p><p className="mt-1">{book.qualityNotice}</p><p className="mt-1">{book.disclaimer}</p></section>
    </main>
    </div>
  </div>;
}
