'use client';

import { ArrowLeft, BookOpen, ChevronRight, Clock3, Code2, GraduationCap, Headphones, Layers, ListChecks, Network, PanelsTopLeft, Play, Search, Sparkles, Timer, TrendingUp, Wrench, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cx, Dialog } from '@/components/ui';
import { certById } from '@/content/certs';
import { topicById } from '@/content/topics';
import { ARENA_LABS, ARENA_TOPICS, KIND_LABEL } from '@/lab/arena';
import { bestFor, useArena } from '@/lab/arena/progress';
import type { ChallengeDef } from '@/lab/challenges';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';
import { useLab } from '@/lab/store';
import { useUi } from '@/state/ui';

const ArenaHome = dynamic(() => import('@/components/arena/ArenaHome').then((module) => module.ArenaHome));

type LibraryKind = 'all' | 'guided' | 'scenario' | 'assessment';
type SectionId = 'guided' | 'scenario' | 'troubleshooting' | 'simlet' | 'automation' | 'gui' | 'interview' | 'challenge';
type ViewMode = 'type' | 'topic';
type Level = 'Beginner' | 'Intermediate' | 'Advanced';
type Entry = {
  id: string;
  title: string;
  topic: string;
  kind: 'workbook' | 'arena' | 'challenge';
  section: SectionId;
  subtype: string;
  level: Level;
  badge: string;
  description: string;
  minutes?: number;
  tasks?: number;
  onSelect: () => void;
};

/** Lab types, in the order a student meets them. `soon` types are listed so the path is visible. */
const SECTIONS: { id: SectionId; label: string; short: string; description: string; icon: typeof BookOpen; tone: string; soon?: boolean }[] = [
  { id: 'guided', label: 'Guided labs', short: 'Guided', description: 'Learn step by step. Tasks tick off live and hints are available.', icon: Sparkles, tone: 'text-healthy' },
  { id: 'scenario', label: 'Scenario labs', short: 'Scenario', description: 'Build a network to a design document, then submit for grading.', icon: Network, tone: 'text-action' },
  { id: 'troubleshooting', label: 'Troubleshooting', short: 'Troubleshoot', description: 'Something is broken. Find the faults and restore service.', icon: Wrench, tone: 'text-degraded' },
  { id: 'simlet', label: 'Simlets', short: 'Simlet', description: 'Read-only network. Investigate with show and ping, then answer questions, like the exam.', icon: Search, tone: 'text-action' },
  { id: 'challenge', label: 'Timed challenges', short: 'Timed', description: 'Exam conditions: a countdown, no hints, automatic submit.', icon: Timer, tone: 'text-down' },
  { id: 'automation', label: 'Automation', short: 'Automation', description: 'JSON, REST APIs and configuration as code.', icon: Code2, tone: 'text-muted', soon: true },
  { id: 'gui', label: 'GUI labs', short: 'GUI', description: 'Configure a wireless controller through its web interface.', icon: PanelsTopLeft, tone: 'text-muted', soon: true },
  { id: 'interview', label: 'Interview labs', short: 'Interview', description: 'Explain your config and troubleshoot out loud with an AI interviewer.', icon: Headphones, tone: 'text-muted', soon: true },
];
const sectionOf = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

function workbookFormat(title: string): Pick<Entry, 'section' | 'subtype'> {
  if (/^timed challenge/i.test(title)) return { section: 'challenge', subtype: 'Timed challenge' };
  if (/^skills assessment/i.test(title)) return { section: 'scenario', subtype: 'Build to spec' };
  if (/^troubleshoot/i.test(title)) return { section: 'troubleshooting', subtype: /three tickets|ticket queue/i.test(title) ? 'Ticket queue' : /new switch|inherited/i.test(title) ? 'Inherited network' : 'Fault hunt' };
  return { section: 'guided', subtype: 'Step by step' };
}
function challengeTopic(challenge: ChallengeDef) {
  if (/vlan|trunk|port|switch/i.test(challenge.id + challenge.title)) return 'Switching and VLANs';
  if (/gateway|mask|ip|address|dhcp|dns|route/i.test(challenge.id + challenge.title)) return 'IP addressing and routing';
  return 'Troubleshooting fundamentals';
}
const arenaTopic = (id: string) => {
  const t = ARENA_TOPICS.find((item) => item.id === id);
  return t ? `Ch ${t.chapter} · ${t.title}` : 'Network operations';
};
const workbookTopic = (topic: string) => (/vlan|trunk/i.test(topic) ? 'Ch 8 · VLANs and trunking' : /stp|etherchannel/i.test(topic) ? 'Ch 9 · Spanning Tree, EtherChannel and edge ports' : topic);
const chapterNo = (topic: string) => Number(/^Ch (\d+)/.exec(topic)?.[1] ?? 999);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The lab library: one page, three choices. Lab type on the left, topic chips on top, labs as cards.
 * Picking a card loads that lab into the canvas; the library closes so the canvas gets the whole screen.
 */
export function LabPicker({ open, onClose, onStart, onChallenge, onArena, onPlayground, initialFilter = 'all', initialTopic = null, initialProgress = false, inline = false }: {
  open: boolean;
  onClose: () => void;
  onStart: (id: string) => void;
  onChallenge: (id: string) => void;
  onArena: (id: string) => void;
  onPlayground: () => void;
  initialFilter?: LibraryKind;
  initialView?: ViewMode;
  initialTopic?: string | null;
  initialProgress?: boolean;
  inline?: boolean;
}) {
  const cert = certById(useUi((s) => s.certId));
  const active = useLab((s) => s.doc?.workbook?.id);
  const activeTitle = active ? (ARENA_LABS.find((l) => `arena:${l.id}` === active)?.title ?? WORKBOOKS.find((w) => w.id === active)?.title) : undefined;
  const progress = useArena();
  const [type, setType] = useState<SectionId | 'all'>('all');
  const [subtype, setSubtype] = useState('all');
  const [topic, setTopic] = useState('all');
  const [query, setQuery] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const level = (d: number): Level => (d <= 1 ? 'Beginner' : d === 2 ? 'Intermediate' : 'Advanced');
    const workbooks: Entry[] = WORKBOOKS.map((w) => ({
      ...workbookFormat(w.title),
      id: w.id,
      title: w.title,
      topic: workbookTopic(w.topic),
      kind: 'workbook',
      level: w.level === 'Foundations' ? 'Beginner' : w.level === 'CCNP' ? 'Advanced' : 'Intermediate',
      badge: w.level,
      description: w.intro,
      minutes: w.minutes,
      tasks: w.tasks.length,
      onSelect: () => onStart(w.id),
    }));
    const arena: Entry[] = ARENA_LABS.map((lab) => ({
      id: lab.id,
      title: lab.title.replace(/^(Simlet|Ticket|Timed challenge): (.)/, (_m, _k, c: string) => c.toUpperCase()),
      topic: arenaTopic(lab.topicId),
      kind: 'arena',
      section: ({ guided: 'guided', skills: 'scenario', troubleshoot: 'troubleshooting', challenge: 'challenge', simlet: 'simlet' } as const)[lab.kind],
      subtype: lab.kind === 'simlet' ? (lab.questions?.some((q) => q.tag) ? 'Ticket (device, technology, fix)' : 'Show-command questions') : lab.kind === 'guided' ? 'Step by step' : lab.kind === 'skills' ? 'Build to spec' : lab.kind === 'challenge' ? 'Timed challenge' : /tickets/i.test(lab.title) ? 'Ticket queue' : /new switch|inherited/i.test(lab.title) ? 'Inherited network' : 'Fault hunt',
      level: level(lab.difficulty),
      badge: KIND_LABEL[lab.kind],
      description: lab.brief.split('\n').find((line) => line.length > 40) ?? lab.brief,
      minutes: lab.timeLimit ?? lab.minutes,
      tasks: lab.items.length + lab.tests.length + (lab.questions?.length ?? 0),
      onSelect: () => onArena(lab.id),
    }));
    const challenges: Entry[] = CHALLENGES.map((c) => ({
      id: c.id,
      title: c.title,
      topic: challengeTopic(c),
      kind: 'challenge',
      section: 'troubleshooting',
      subtype: 'Fault hunt',
      level: c.level === 'CCNP' ? 'Advanced' : 'Intermediate',
      badge: `${c.level} ticket`,
      description: 'A fault is hidden in the current design. Find it with the canvas, device consoles and packet tools.',
      onSelect: () => onChallenge(c.id),
    }));
    const recommended = new Set(cert?.labs ?? []);
    return [...workbooks, ...arena, ...challenges].sort((a, b) => Number(recommended.has(b.id)) - Number(recommended.has(a.id)) || chapterNo(a.topic) - chapterNo(b.topic) || a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
  }, [cert, onArena, onChallenge, onStart]);

  // Deep links: /lab?library=guided&topic=<learn topic id>&progress=1
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    if (!open) return;
    setType(initialFilter === 'guided' ? 'guided' : initialFilter === 'scenario' ? 'scenario' : 'all');
    setSubtype('all');
    setShowProgress(initialProgress);
    setNotice(null);
    if (!initialTopic) return setTopic('all');
    const study = topicById(initialTopic);
    const linked = study?.lab?.workbook ?? study?.lab?.challenge;
    const fromLink = linked ? entriesRef.current.find((e) => e.id === linked)?.topic : undefined;
    const chapter = initialTopic.match(/ch-?(\d+)/i)?.[1];
    const fromName = entriesRef.current.find((e) => slug(e.topic) === slug(initialTopic) || (chapter && chapterNo(e.topic) === Number(chapter)))?.topic;
    const match = fromLink ?? fromName;
    setTopic(match ?? 'all');
    if (!match && study) setNotice(`No lab is linked to “${study.title}” yet, so every lab is shown.`);
  }, [open, initialFilter, initialTopic, initialProgress]);

  const q = query.trim().toLowerCase();
  const matchesText = (e: Entry) => !q || `${e.title} ${e.topic} ${e.description} ${e.subtype}`.toLowerCase().includes(q);
  const inType = (e: Entry) => type === 'all' || e.section === type;
  const shown = entries.filter((e) => inType(e) && (subtype === 'all' || e.subtype === subtype) && (topic === 'all' || e.topic === topic) && matchesText(e));
  const typeCount = (id: SectionId) => entries.filter((e) => e.section === id && (topic === 'all' || e.topic === topic) && matchesText(e)).length;
  const topics = useMemo(() => [...new Set(entries.map((e) => e.topic))].sort((a, b) => chapterNo(a) - chapterNo(b) || a.localeCompare(b)), [entries]);
  const topicCount = (t: string) => entries.filter((e) => inType(e) && e.topic === t && matchesText(e)).length;
  const subtypes = type === 'all' ? [] : [...new Set(entries.filter((e) => e.section === type).map((e) => e.subtype))];
  const filtered = type !== 'all' || subtype !== 'all' || topic !== 'all' || !!q;
  const reset = () => {
    setType('all');
    setSubtype('all');
    setTopic('all');
    setQuery('');
    setNotice(null);
  };
  const pickType = (id: SectionId | 'all') => {
    setShowProgress(false);
    setType(id);
    setSubtype('all');
  };

  const card = (e: Entry) => {
    const sec = sectionOf(e.section);
    const running = active === e.id || active === `arena:${e.id}`;
    const best = e.kind === 'arena' ? bestFor(progress, e.id) : undefined;
    const Icon = sec.icon;
    return (
      <li key={`${e.kind}:${e.id}`}>
        <button
          type="button"
          onClick={e.onSelect}
          className={cx('group flex h-full w-full flex-col rounded-[10px] border bg-pane p-3.5 text-left transition-colors hover:border-action focus-visible:outline-2 focus-visible:outline-action', running ? 'border-action' : 'border-line')}
          data-testid={`lab-card-${e.id}`}
        >
          <span className="flex items-center gap-2 text-[11.5px]">
            <span className={cx('inline-flex items-center gap-1 font-medium', sec.tone)}>
              <Icon className="size-3.5" aria-hidden />
              {e.subtype}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted">{e.level}</span>
            {running ? <span className="ml-auto rounded-full bg-action/15 px-2 py-0.5 text-[10.5px] font-medium text-action">In progress</span> : best ? <span className={cx('ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums', best.pct >= 80 ? 'bg-healthy/15 text-healthy' : 'bg-degraded/15 text-degraded')}>Best {best.pct}%</span> : null}
          </span>
          <span className="mt-2 text-[14px] leading-snug font-semibold text-balance group-hover:text-action">{e.title}</span>
          <span className="mt-1 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-muted">{e.description}</span>
          <span className="mt-3 flex items-center gap-3 border-t border-line pt-2.5 text-[11.5px] text-muted">
            <span className="min-w-0 truncate">{e.topic}</span>
            {e.minutes !== undefined && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock3 className="size-3.5" aria-hidden />
                {e.minutes} min
              </span>
            )}
            {e.tasks !== undefined && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <ListChecks className="size-3.5" aria-hidden />
                {e.tasks}
              </span>
            )}
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-medium text-action">
              {running ? 'Resume' : 'Start'} <ChevronRight className="size-3.5" aria-hidden />
            </span>
          </span>
        </button>
      </li>
    );
  };
  const grid = (list: Entry[]) => <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">{list.map(card)}</ul>;

  const typeButton = (id: SectionId | 'all', label: string, Icon: typeof BookOpen, count: number, soon = false) => (
    <button
      key={id}
      type="button"
      disabled={soon}
      onClick={() => pickType(id)}
      aria-current={type === id && !showProgress ? 'true' : undefined}
      className={cx('flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] transition-colors disabled:cursor-default', type === id && !showProgress ? 'bg-action/15 font-medium text-text' : soon ? 'text-faint' : 'text-muted hover:bg-pane-2 hover:text-text')}
      data-testid={`lab-section-${id}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cx('text-[11px] tabular-nums', soon ? 'rounded bg-pane-2 px-1.5 py-0.5 text-[10px]' : 'text-faint')}>{soon ? 'Soon' : count}</span>
    </button>
  );

  const content = (
    <div className={cx('mx-auto w-full max-w-[1440px]', inline && 'p-4 sm:p-5')} data-testid="lab-picker">
      {/* Header: what this page is, and the two ways out of it */}
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h2 className="text-[19px] font-semibold">Lab library</h2>
          <p className="text-[12.5px] text-muted">Pick a lab type, narrow it by topic if you want, then start. The lab opens in the canvas.</p>
        </div>
        <Button variant="secondary" onClick={onPlayground} data-testid="lab-open-playground">
          <GraduationCap className="size-4" /> Open playground
        </Button>
        {inline && (
          <Button variant={activeTitle ? 'primary' : 'secondary'} onClick={onClose} data-testid="lab-back-to-canvas">
            <ArrowLeft className="size-4" /> {activeTitle ? 'Back to my lab' : 'Back to canvas'}
          </Button>
        )}
        {!inline && (
          <Button variant="ghost" onClick={onClose} aria-label="Close lab library">
            <X className="size-4" />
          </Button>
        )}
      </header>

      {activeTitle && (
        <button type="button" onClick={onClose} className="mb-4 flex w-full items-center gap-3 rounded-[10px] border border-action/40 bg-action/10 px-3.5 py-2.5 text-left hover:border-action" data-testid="lab-continue">
          <Play className="size-4 shrink-0 text-action" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px]">
            <span className="text-muted">Continue: </span>
            <span className="font-medium">{activeTitle}</span>
          </span>
          <ChevronRight className="size-4 text-action" aria-hidden />
        </button>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* Lab types: a column on wide screens, a scrolling row on phones */}
        <nav aria-label="Lab types" className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:hidden">
            {[{ id: 'all' as const, short: 'All labs' }, ...SECTIONS.filter((s) => !s.soon)].map((s) => (
              <button key={s.id} type="button" onClick={() => pickType(s.id)} className={cx('shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]', type === s.id && !showProgress ? 'border-action bg-action/15 text-text' : 'border-line text-muted')}>
                {s.short}
              </button>
            ))}
            <button type="button" onClick={() => setShowProgress(true)} className={cx('shrink-0 rounded-full border px-3 py-1.5 text-[12.5px]', showProgress ? 'border-action bg-action/15 text-text' : 'border-line text-muted')}>
              My progress
            </button>
          </div>
          <div className="hidden space-y-0.5 rounded-[10px] border border-line bg-pane p-1.5 lg:block">
            {typeButton('all', 'All labs', Layers, SECTIONS.reduce((n, s) => n + typeCount(s.id), 0))}
            <div className="my-1.5 h-px bg-line" />
            {SECTIONS.filter((s) => !s.soon).map((s) => typeButton(s.id, s.label, s.icon, typeCount(s.id)))}
            <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-faint uppercase">Coming next</p>
            {SECTIONS.filter((s) => s.soon).map((s) => typeButton(s.id, s.label, s.icon, 0, true))}
            <div className="my-1.5 h-px bg-line" />
            <button type="button" onClick={() => setShowProgress(true)} aria-current={showProgress ? 'true' : undefined} className={cx('flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px]', showProgress ? 'bg-action/15 font-medium text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid="lab-progress">
              <TrendingUp className="size-4" aria-hidden /> My progress
            </button>
          </div>
        </nav>

        <div className="min-w-0" aria-live="polite">
          {showProgress ? (
            <div>
              <Button variant="ghost" size="sm" className="mb-2" onClick={() => setShowProgress(false)}>
                <ArrowLeft className="size-3.5" /> Back to labs
              </Button>
              <ArenaHome embedded onLaunch={onArena} />
            </div>
          ) : (
            <>
              {/* Search and topic chips */}
              <div className="mb-4 space-y-2.5">
                <label className="relative block max-w-[520px]">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search labs: VLAN, OSPF, DHCP, ticket…" aria-label="Search labs" className="h-10 w-full rounded-[8px] border border-line-strong bg-ink pr-3 pl-9 text-[13.5px] focus:border-action" data-testid="lab-picker-search" />
                </label>
                <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Topics">
                  {['all', ...topics].map((t) => {
                    const n = t === 'all' ? null : topicCount(t);
                    if (n === 0 && topic !== t) return null;
                    return (
                      <button key={t} type="button" onClick={() => setTopic(t)} aria-pressed={topic === t} className={cx('shrink-0 rounded-full border px-3 py-1 text-[12px] transition-colors', topic === t ? 'border-action bg-action/15 text-text' : 'border-line text-muted hover:border-line-strong hover:text-text')} data-testid={`lab-topic-${slug(t)}`}>
                        {t === 'all' ? 'All topics' : t}
                        {n !== null && <span className="ml-1.5 text-faint tabular-nums">{n}</span>}
                      </button>
                    );
                  })}
                </div>
                {notice && <p className="text-[12px] text-degraded">{notice}</p>}
              </div>

              {/* What you are looking at */}
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold">{type === 'all' ? 'All labs' : sectionOf(type).label}</h3>
                  <p className="text-[12px] text-muted">{type === 'all' ? 'Every lab, grouped by type.' : sectionOf(type).description}</p>
                </div>
                <span className="text-[12px] text-muted tabular-nums">{shown.length} lab{shown.length === 1 ? '' : 's'}</span>
                {filtered && (
                  <Button size="sm" variant="ghost" onClick={reset}>
                    Clear filters
                  </Button>
                )}
              </div>
              {subtypes.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Lab formats">
                  {['all', ...subtypes].map((st) => (
                    <button key={st} type="button" onClick={() => setSubtype(st)} aria-pressed={subtype === st} className={cx('rounded-[6px] border px-2.5 py-1 text-[12px]', subtype === st ? 'border-action bg-action/10 text-text' : 'border-line text-muted hover:text-text')} data-testid={`lab-subtype-${slug(st)}`}>
                      {st === 'all' ? 'All formats' : st}
                    </button>
                  ))}
                </div>
              )}

              {shown.length === 0 ? (
                <div className="grid min-h-48 place-items-center rounded-[10px] border border-dashed border-line-strong p-6 text-center">
                  <div>
                    <BookOpen className="mx-auto size-6 text-faint" aria-hidden />
                    <p className="mt-2 text-[13.5px] font-medium">No labs match</p>
                    <p className="mt-1 text-[12.5px] text-muted">Try another topic or lab type.</p>
                    <Button size="sm" className="mt-3" onClick={reset}>
                      Show all labs
                    </Button>
                  </div>
                </div>
              ) : type === 'all' ? (
                <div className="space-y-6" data-testid="lab-library-results">
                  {SECTIONS.filter((s) => !s.soon).map((s) => {
                    const list = shown.filter((e) => e.section === s.id);
                    if (!list.length) return null;
                    return (
                      <section key={s.id} aria-label={s.label} data-testid={`lab-group-${s.id}`}>
                        <div className="mb-2 flex items-center gap-2">
                          <s.icon className={cx('size-4', s.tone)} aria-hidden />
                          <h4 className="text-[13.5px] font-semibold">{s.label}</h4>
                          <span className="text-[12px] text-faint tabular-nums">{list.length}</span>
                          {list.length > 6 && (
                            <button type="button" onClick={() => pickType(s.id)} className="ml-auto inline-flex items-center gap-0.5 text-[12px] text-action hover:underline">
                              See all <ChevronRight className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                        {grid(list.slice(0, 6))}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div data-testid="lab-library-results">{grid(shown)}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (inline) return open ? <section className="min-h-0 flex-1 overflow-y-auto bg-ink" aria-label="Lab library">{content}</section> : null;
  return (
    <Dialog open={open} onClose={onClose} title="Lab library" wide>
      {content}
    </Dialog>
  );
}
