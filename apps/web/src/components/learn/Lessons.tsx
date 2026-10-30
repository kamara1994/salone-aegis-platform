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

export function LessonReader({ lessonId, initialSection, onClose }: { lessonId: string; initialSection?: string; onClose: () => void }) {
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
  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]" data-testid="lesson-reader">
      <nav aria-label="Lesson sections" className="space-y-2 lg:sticky lg:top-2 lg:self-start">
        <button className="flex items-center gap-1 text-[13px] text-muted hover:text-text" onClick={onClose}>
          <ArrowLeft className="size-4" /> All lessons
        </button>
        <p className="text-[15px] font-semibold">{lesson.title}</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Explanation style">
          {(['simple', 'technical'] as const).map((l) => (
            <button key={l} role="radio" aria-checked={teach === l} onClick={() => setTeachingLevel(l)} className={cx('flex-1 rounded border px-2 py-1 text-[12px]', teach === l ? 'border-action bg-action/15' : 'border-line text-muted')}>
              {l === 'simple' ? 'Beginner' : 'Technical / Expert'}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Mode">
          {(
            [
              ['watch', 'Watch'],
              ['guided', 'Guided'],
              ['independent', 'Solo'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} role="radio" aria-checked={mode === m} title={m === 'watch' ? 'Answers and outputs shown' : m === 'guided' ? 'Interactive with hints' : 'Interactive, no hints'} onClick={() => set({ mode: m as Mode })} className={cx('flex-1 rounded border px-2 py-1 text-[12px]', mode === m ? 'border-action bg-action/15' : 'border-line text-muted')} data-testid={`mode-${m}`}>
              {label}
            </button>
          ))}
        </div>
        <ol className="max-h-[50vh] space-y-0.5 overflow-auto">
          {sections.map((s, k) => (
            <li key={s.id}>
              <button onClick={() => setIdx(k)} aria-current={k === idx ? 'step' : undefined} className={cx('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px]', k === idx ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')}>
                <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]', lp.visited.includes(s.id) ? 'border-healthy bg-healthy text-white' : 'border-line-strong')}>{lp.visited.includes(s.id) ? <Check className="size-3" /> : k + 1}</span>
                {s.title}
                {s.advanced && <span className="ml-auto text-[10px] text-action">adv</span>}
              </button>
            </li>
          ))}
        </ol>
        {lesson.lab && (
          <Link href={`/lab?${lesson.lab.workbook ? `workbook=${lesson.lab.workbook}` : `challenge=${lesson.lab.challenge}`}`} className="flex items-center justify-center gap-1.5 rounded-[5px] bg-action px-3 py-2 text-[13px] font-medium text-white" data-testid="lesson-open-lab-header">
            <FlaskConical className="size-4" /> Open this in the Lab
          </Link>
        )}
        <label className="block">
          <span className="text-[12px] text-muted">My notes (saved on this computer)</span>
          <Textarea rows={3} defaultValue={progress.notes[lesson.id] ?? ''} onBlur={(e) => set({ notes: { ...progress.notes, [lesson.id]: e.target.value } })} aria-label="Lesson notes" />
        </label>
      </nav>
      <article className="min-w-0 space-y-4" aria-labelledby="lesson-section-title">
        <div id="lesson-top" className="space-y-1">
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span>
              Section {idx + 1} of {sections.length}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded bg-pane-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Lesson progress">
              <span className="block h-full bg-action" style={{ width: `${pct}%` }} />
            </span>
            <span data-testid="lesson-progress">{pct}%</span>
            <button
              aria-pressed={bookmarked}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this section'}
              data-testid="lesson-bookmark"
              onClick={() => set({ bookmarks: bookmarked ? progress.bookmarks.filter((b) => !(b.lesson === lesson.id && b.section === sec.id)) : [...progress.bookmarks, { lesson: lesson.id, section: sec.id, at: new Date().toISOString() }] })}
              className="text-muted hover:text-text"
            >
              {bookmarked ? <BookmarkCheck className="size-5 text-action" /> : <Bookmark className="size-5" />}
            </button>
          </div>
          <h2 id="lesson-section-title" className="text-[22px] font-semibold" data-testid="lesson-section-title">
            {sec.title}
          </h2>
        </div>
        <div className="max-w-[820px] space-y-4" key={`${sec.id}-${mode}-${level}`}>
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
        <div className="flex max-w-[820px] items-center justify-between border-t border-line pt-3">
          <Button onClick={() => setIdx(idx - 1)} disabled={idx === 0} data-testid="lesson-back">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <span className="text-[12px] text-muted">← → keys also work</span>
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
    </div>
  );
}
