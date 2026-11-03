'use client';

import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Check, FlaskConical, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, cx, Input, Textarea } from '@/components/ui';
import { allLessons, TRACKS } from '@/content';
import { lessonProgress, loadProgress, updateProgress, type Progress } from '@/content/progress';
import { setTeachingLevel, useLearningPreferences } from '@/state/learning';
import type { Block, Lesson, TrackId } from '@/content/types';
import { BlockView, type Mode } from './Blocks';
import { ShowSide, StudySide, useSide, type SideGroup } from './StudyKit';
import { AskAI } from '@/components/tutor/AskAI';

function blockText(b: Block): string {
  switch (b.type) {
    case 'p':
    case 'h':
      return b.text;
    case 'list':
      return b.items.join(' ');
    case 'code':
      return b.code;
    case 'cmd':
      return `${b.command} ${b.output ?? ''} ${b.explain ?? ''}`;
    case 'callout':
      return b.text;
    case 'table':
      return [...b.head, ...b.rows.flat()].join(' ');
    case 'reveal':
      return `${b.prompt} ${b.answer}`;
    case 'predict':
      return `${b.question} ${b.options.join(' ')}`;
    case 'quiz':
      return b.questions.map((q) => `${q.q} ${q.options.join(' ')}`).join(' ');
    default:
      return '';
  }
}

export function lessonMatches(l: Lesson, q: string): { section?: string } | null {
  const n = q.trim().toLowerCase();
  if (!n) return {};
  if (`${l.title} ${l.summary} ${(l.tags ?? []).join(' ')}`.toLowerCase().includes(n)) return {};
  for (const s of l.sections) if (`${s.title} ${s.blocks.map(blockText).join(' ')}`.toLowerCase().includes(n)) return { section: s.id };
  return null;
}

export function LessonLibrary({ onOpen, track }: { onOpen: (id: string, section?: string) => void; track?: TrackId }) {
  const [q, setQ] = useState('');
  const [tr, setTr] = useState<TrackId | 'all'>(track ?? 'all');
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => setProgress(loadProgress()), []);
  const lessons = allLessons()
    .filter((l) => tr === 'all' || l.tracks.includes(tr))
    .map((l) => ({ l, hit: lessonMatches(l, q) }))
    .filter((x) => x.hit);
  return (
    <div className="space-y-3" data-testid="lesson-library">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lessons: VLAN, ARP, ticket, SIEM…" className="!h-9 !w-80 pl-8" aria-label="Search lessons" data-testid="lesson-search" />
        </div>
        <select className="h-9 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]" value={tr} onChange={(e) => setTr(e.target.value as TrackId | 'all')} aria-label="Track">
          <option value="all">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-muted">{lessons.length} lessons</span>
      </div>
      {progress && progress.bookmarks.length > 0 && (
        <div className="rounded-[6px] border border-line p-2 text-[13px]" data-testid="bookmarks">
          <p className="mb-1 font-semibold">Bookmarks</p>
          <ul className="flex flex-wrap gap-2">
            {progress.bookmarks.map((b) => {
              const l = allLessons().find((x) => x.id === b.lesson);
              const s = l?.sections.find((x) => x.id === b.section);
              return l && s ? (
                <li key={`${b.lesson}/${b.section}`}>
                  <button className="rounded border border-line px-2 py-1 hover:border-action" onClick={() => onOpen(l.id, s.id)}>
                    {l.title}: {s.title}
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {lessons.map(({ l, hit }) => {
          const p = progress ? lessonProgress(progress, l.id) : null;
          const pct = p ? Math.round((p.visited.length / l.sections.length) * 100) : 0;
          return (
            <li key={l.id}>
              <button className="flex h-full w-full flex-col gap-1.5 rounded-[6px] border border-line p-3 text-left hover:border-action" onClick={() => onOpen(l.id, hit?.section)} data-testid={`lesson-${l.id}`}>
                <div className="flex items-center gap-2">
                  {l.imported && <Badge tone="warn">Imported</Badge>}
                  {p?.done && <Badge tone="good">Done</Badge>}
                  <span className="text-[12px] text-muted">
                    {l.minutes} min · {'●'.repeat(l.difficulty)}
                    {'○'.repeat(3 - l.difficulty)}
                  </span>
                </div>
                <span className="text-[15px] font-semibold">{l.title}</span>
                <span className="text-[13px] text-muted">{l.summary}</span>
                {hit?.section && q && <span className="text-[12px] text-action">Match in “{l.sections.find((s) => s.id === hit.section)?.title}”</span>}
                <span className="mt-auto flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-pane-2">
                    <span className="block h-full bg-action" style={{ width: `${pct}%` }} />
                  </span>
                  {pct > 0 && <span className="text-[11px] text-muted tabular-nums" data-testid="lesson-card-progress">{pct}%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LessonReader({ lessonId, initialSection, onClose, showBack }: { lessonId: string; initialSection?: string; onClose: () => void; showBack?: boolean }) {
  const { teach } = useLearningPreferences();
  const lesson = allLessons().find((l) => l.id === lessonId)!;
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const level = teach === 'technical' ? 'advanced' : 'beginner';
  const mode = progress.mode;
  const sections = useMemo(() => lesson.sections.filter((s) => level === 'advanced' || !s.advanced), [lesson, level]);
  const start = initialSection ? Math.max(0, sections.findIndex((s) => s.id === initialSection)) : Math.min(lessonProgress(progress, lesson.id).section, sections.length - 1);
  const [idx, setIdx] = useState(start);
  const safeIdx = Math.max(0, Math.min(idx, sections.length - 1));
  const sec = sections[safeIdx];
  const lp = lessonProgress(progress, lesson.id);
  const bookmarked = progress.bookmarks.some((b) => b.lesson === lesson.id && b.section === sec.id);

  // Record the visit and position.
  useEffect(() => {
    setProgress(
      updateProgress((p) => {
        const cur = lessonProgress(p, lesson.id);
        const visited = [...new Set([...cur.visited, sec.id])];
        p.lessons[lesson.id] = { ...cur, section: idx, visited, done: cur.done || visited.length >= sections.length, updatedAt: new Date().toISOString() };
      }),
    );
  }, [idx, sec.id, lesson.id, sections.length]);

  // Keyboard: arrows move between sections (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === 'ArrowRight' && idx < sections.length - 1) setIdx(idx + 1);
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, sections.length]);

  useEffect(() => {
    document.getElementById('lesson-top')?.scrollIntoView({ block: 'start' });
  }, [idx]);

  const set = (patch: Partial<Progress>) => setProgress(updateProgress((p) => Object.assign(p, patch)));
  useEffect(() => {
    if (idx >= sections.length) setIdx(Math.max(0, sections.length - 1));
  }, [idx, sections.length]);
  const pct = Math.round(((idx + 1) / sections.length) * 100);
  const toggleBookmark = () => set({ bookmarks: bookmarked ? progress.bookmarks.filter((b) => !(b.lesson === lesson.id && b.section === sec.id)) : [...progress.bookmarks, { lesson: lesson.id, section: sec.id, at: new Date().toISOString() }] });
  return (
    <div className="mx-auto max-w-[860px] space-y-4" data-testid="lesson-reader">
      <header id="lesson-top" className="lesson-head">
        <div className="flex flex-wrap items-center gap-2">
          {showBack && (
            <button className="mr-1 flex items-center gap-1 text-[12.5px] text-muted hover:text-text" onClick={onClose}>
              <ArrowLeft className="size-4" /> All lessons
            </button>
          )}
          <span className="text-[10.5px] font-semibold tracking-[0.2em] text-faint uppercase">
            Lesson · {lesson.minutes} min · {'●'.repeat(lesson.difficulty)}
            {'○'.repeat(3 - lesson.difficulty)}
          </span>
          {lp.done && <Badge tone="good">Done</Badge>}
          <div className="ml-auto flex flex-wrap gap-2">
            <div className="seg !p-0.5" role="radiogroup" aria-label="Explanation style">
              {(['simple', 'technical'] as const).map((l) => (
                <button key={l} role="radio" aria-checked={teach === l} onClick={() => setTeachingLevel(l)} className={cx('seg-btn !px-2.5 !py-1 !text-[12px]', teach === l && 'is-on')}>
                  {l === 'simple' ? 'Beginner' : 'Technical'}
                </button>
              ))}
            </div>
            <div className="seg !p-0.5" role="radiogroup" aria-label="Mode">
              {(
                [
                  ['watch', 'Watch'],
                  ['guided', 'Guided'],
                  ['independent', 'Solo'],
                ] as const
              ).map(([m, label]) => (
                <button key={m} role="radio" aria-checked={mode === m} title={m === 'watch' ? 'Answers and outputs shown' : m === 'guided' ? 'Interactive with hints' : 'Interactive, no hints'} onClick={() => set({ mode: m as Mode })} className={cx('seg-btn !px-2.5 !py-1 !text-[12px]', mode === m && 'is-on')} data-testid={`mode-${m}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-start gap-3">
          <h1 className="flex-1 text-[26px] leading-tight font-semibold tracking-[-0.01em] text-text">{lesson.title}</h1>
          <AskAI ctx={{ kind: 'Lesson', label: lesson.title, text: `${lesson.summary} ${sec.title}` }} className="mt-1.5" />
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{lesson.summary}</p>
      </header>

      <nav className="book-stepper sticky top-0 z-10" aria-label="Lesson sections">
        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span>
            Section <b className="text-text">{safeIdx + 1}</b> of {sections.length}
          </span>
          <span className="text-faint">·</span>
          <span className="truncate">{sec.title}</span>
          <span className="ml-auto tabular-nums" data-testid="lesson-progress">{pct}%</span>
          <button aria-pressed={bookmarked} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this section'} data-testid="lesson-bookmark" onClick={toggleBookmark} className="text-muted hover:text-text">
            {bookmarked ? <BookmarkCheck className="size-4.5 text-action" /> : <Bookmark className="size-4.5" />}
          </button>
        </div>
        <ol className="book-segments" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Lesson progress">
          {sections.map((s, k) => (
            <li key={s.id}>
              <button type="button" onClick={() => setIdx(k)} aria-current={k === safeIdx ? 'step' : undefined} aria-label={`Section ${k + 1}: ${s.title}`} data-state={k === safeIdx ? 'current' : lp.visited.includes(s.id) ? 'done' : 'todo'} data-label={`${k + 1}. ${s.title}${s.advanced ? ' (advanced)' : ''}`} />
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 space-y-4" aria-labelledby="lesson-section-title">
        <h2 id="lesson-section-title" className="text-[22px] font-semibold" data-testid="lesson-section-title">
          {sec.title}
        </h2>
        <div className="space-y-4" key={`${sec.id}-${mode}-${level}`}>
          {sec.blocks.map((b, k) => (
            <BlockView
              key={k}
              block={b}
              mode={mode}
              level={level}
              onQuiz={(id, c, t) => setProgress(updateProgress((p) => {
                const cur = lessonProgress(p, lesson.id);
                p.lessons[lesson.id] = { ...cur, quiz: { ...cur.quiz, [id]: { correct: c, total: t } } };
              }))}
              onTrainer={(id, n) => setProgress(updateProgress((p) => {
                const cur = lessonProgress(p, lesson.id);
                p.lessons[lesson.id] = { ...cur, trainer: { ...cur.trainer, [id]: n } };
              }))}
            />
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <Button onClick={() => setIdx(idx - 1)} disabled={idx === 0} data-testid="lesson-back">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <span className="text-[12px] text-faint">← → keys also work</span>
          {idx < sections.length - 1 ? (
            <Button variant="primary" onClick={() => setIdx(idx + 1)} data-testid="lesson-next">
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose} data-testid="lesson-finish">
              Finish lesson <Check className="size-4" />
            </Button>
          )}
        </div>
      </article>

      <div className="grid gap-3 md:grid-cols-[auto_1fr]">
        {lesson.lab && (
          <Link href={`/lab?${lesson.lab.workbook ? `workbook=${lesson.lab.workbook}` : `challenge=${lesson.lab.challenge}`}`} className="lesson-lab" data-testid="lesson-open-lab-header">
            <FlaskConical className="size-4" /> Open this in the Lab
          </Link>
        )}
        <details className="lesson-notes">
          <summary className="cursor-pointer text-[12.5px] text-muted">My notes for this lesson {progress.notes[lesson.id] ? '·' : ''} <span className="text-faint">saved on this computer</span></summary>
          <Textarea rows={3} className="mt-2" defaultValue={progress.notes[lesson.id] ?? ''} onBlur={(e) => set({ notes: { ...progress.notes, [lesson.id]: e.target.value } })} aria-label="Lesson notes" />
        </details>
      </div>
    </div>
  );
}

/** Interactive lessons with the Learn by topic layout: tracks and lessons on the left, the open lesson on the right. */
export function LessonStudio({ lesson, onOpen }: { lesson: string | null; onOpen: (id: string) => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [q, setQ] = useState('');
  const [side, setSide] = useSide('aegis.lessons.side');
  useEffect(() => setProgress(loadProgress()), [lesson]);
  const all = useMemo(() => allLessons(), []);
  // Each lesson sits under its first track so it appears once.
  const groups: SideGroup[] = useMemo(() => {
    const seen = new Set<string>();
    const out: SideGroup[] = [];
    const hues = ['#4f9cf9', '#22b8cf', '#ff922b', '#cc5de8', '#20c997', '#ff6b6b', '#4c6ef5', '#fcc419', '#12b886', '#f06595', '#94d82d', '#339af0'];
    TRACKS.forEach((t, k) => {
      const items = all
        .filter((l) => !seen.has(l.id) && l.tracks.includes(t.id) && lessonMatches(l, q))
        .map((l) => {
          seen.add(l.id);
          return { id: l.id, label: l.title, done: !!(progress && lessonProgress(progress, l.id).done) };
        });
      if (items.length) out.push({ key: t.id, title: t.title, hue: hues[k % hues.length], items });
    });
    const rest = all.filter((l) => !seen.has(l.id) && lessonMatches(l, q)).map((l) => ({ id: l.id, label: l.title, done: !!(progress && lessonProgress(progress, l.id).done) }));
    if (rest.length) out.push({ key: 'other', title: 'Other lessons', hue: '#868e96', items: rest });
    return out;
  }, [all, q, progress]);
  const flat = groups.flatMap((g) => g.items);
  const latest = progress ? Object.entries(progress.lessons).sort((a, b) => (b[1].updatedAt ?? '').localeCompare(a[1].updatedAt ?? ''))[0]?.[0] : undefined;
  const current = lesson ?? (latest && all.some((l) => l.id === latest) ? latest : flat[0]?.id);
  const finish = () => {
    const i = flat.findIndex((x) => x.id === current);
    const next = flat.slice(i + 1).find((x) => !x.done) ?? flat[i + 1];
    if (next) onOpen(next.id);
  };
  const bookmarks = progress?.bookmarks ?? [];
  return (
    <div className="flex gap-6" data-testid="lesson-library">
      {side && (
        <StudySide
          eyebrow="Interactive lessons"
          doneLabel="lessons done"
          groups={groups}
          current={current}
          onItem={onOpen}
          onHide={() => setSide(false)}
          testid="lesson-side"
          extra={
            <div className="mb-2 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: VLAN, ARP, SIEM…" className="!h-8 !w-full !rounded-full pl-8 !text-[12.5px]" aria-label="Search lessons" data-testid="lesson-search" />
              </div>
              {bookmarks.length > 0 && (
                <div className="flex flex-wrap gap-1" data-testid="bookmarks">
                  {bookmarks.slice(-4).map((b) => {
                    const l = all.find((x) => x.id === b.lesson);
                    return l ? (
                      <button key={`${b.lesson}/${b.section}`} onClick={() => onOpen(l.id)} className="toc-chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted hover:text-text" title={l.sections.find((s) => s.id === b.section)?.title}>
                        <BookmarkCheck className="size-3 text-action" /> {l.title.slice(0, 22)}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          }
        />
      )}
      <div className="min-w-0 flex-1">
        {!side && (
          <div className="mx-auto mb-3 max-w-[860px]">
            <ShowSide onShow={() => setSide(true)} label="Lessons" />
          </div>
        )}
        {current ? <LessonReader key={current} lessonId={current} onClose={finish} /> : <p className="text-muted">No lessons match “{q}”.</p>}
      </div>
    </div>
  );
}
