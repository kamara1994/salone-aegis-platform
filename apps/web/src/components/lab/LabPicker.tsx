'use client';

import { BookOpen, Clock3, Search, Sparkles, Wrench, Code2, Network, Timer, Headphones, PanelsTopLeft, GraduationCap, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, cx, Dialog } from '@/components/ui';
import { certById, certTopics } from '@/content/certs';
import { ALL_TOPICS, COURSES, topicById } from '@/content/topics';
import { ARENA_LABS, ARENA_TOPICS, KIND_LABEL, labsFor } from '@/lab/arena';
import { topicMastery, useArena } from '@/lab/arena/progress';
import type { ArenaKind } from '@/lab/arena/types';
import type { ChallengeDef } from '@/lab/challenges';
import { CHALLENGES } from '@/lab/challenges';
import { labCategory, WORKBOOKS } from '@/lab/workbooks';
import { useUi } from '@/state/ui';
import { useLab } from '@/lab/store';
import dynamic from 'next/dynamic';
const ArenaHome = dynamic(() => import('@/components/arena/ArenaHome').then((module) => module.ArenaHome));

type LibraryKind = 'all' | 'guided' | 'scenario' | 'assessment';
type SectionId = 'guided' | 'scenario' | 'troubleshooting' | 'simlet' | 'automation' | 'gui' | 'interview' | 'challenge' | 'playground';
type ViewMode = 'type' | 'topic';
type Entry = {
  id: string;
  title: string;
  topic: string;
  legacyCategory: string;
  kind: 'workbook' | 'arena' | 'challenge';
  section: SectionId;
  subtype: string;
  goal: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  category: Exclude<LibraryKind, 'all'>;
  badge: string;
  description: string;
  minutes?: number;
  tasks?: number;
  difficulty?: number;
  onSelect: () => void;
};

const KIND_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = {
  Foundations: 'good', CCNA: 'neutral', CCNP: 'warn', Security: 'bad', SOC: 'info', Enterprise: 'info', Ops: 'neutral',
  Guided: 'good', 'Skills assessment': 'info', Troubleshooting: 'warn', 'Timed challenge': 'bad',
};
const SECTIONS: { id: SectionId; label: string; description: string; icon: typeof BookOpen; available: boolean }[] = [
  { id: 'guided', label: 'Guided & Basic Labs', description: 'Learn step by step with live checks and hints.', icon: Sparkles, available: true },
  { id: 'scenario', label: 'Scenario Labs', description: 'Build from a specification, complete a partial network, or plan a design.', icon: Network, available: true },
  { id: 'troubleshooting', label: 'Troubleshooting Labs', description: 'Find faults, work tickets, and restore service.', icon: Wrench, available: true },
  { id: 'simlet', label: 'Simlet Labs', description: 'Read command output and packet evidence, then explain what happened.', icon: Search, available: false },
  { id: 'automation', label: 'Automation Labs', description: 'Work with JSON, mock APIs, and configuration as code.', icon: Code2, available: false },
  { id: 'gui', label: 'GUI Labs', description: 'Configure network services through a controller interface.', icon: PanelsTopLeft, available: false },
  { id: 'interview', label: 'Interview Labs', description: 'Explain decisions, troubleshoot aloud, and design on a whiteboard.', icon: Headphones, available: false },
  { id: 'challenge', label: 'Challenge Mode', description: 'Timed attempts with no hints and automatic submission.', icon: Timer, available: true },
  { id: 'playground', label: 'Open Playground', description: 'Free practice on a blank canvas with no grading.', icon: GraduationCap, available: true },
];
const SUBTYPES: Partial<Record<SectionId, string[]>> = {
  guided: ['Step-by-step build'],
  scenario: ['Build to Spec', 'Fill-the-Gap', 'Change Request', 'Design Lab', 'Capstone'],
  troubleshooting: ['Fault Hunt', 'Ticket Queue', 'Outage / On-Call', 'Inherited Network'],
  simlet: ['Show-Command Questions', 'Rapid-Fire Output', 'Packet Analysis'],
  automation: ['JSON Read/Fix', 'REST API', 'Config as Code'],
  gui: ['Wireless Controller'],
  interview: ['Explain Your Config', 'Live Troubleshoot Interview', 'Whiteboard Interview'],
  challenge: ['Timed challenge'],
};
const ARENA_KIND_CATEGORY: Record<ArenaKind, Entry['category']> = {
  guided: 'guided', skills: 'assessment', troubleshoot: 'scenario', challenge: 'assessment',
};

function workbookFormat(title: string): Pick<Entry, 'section' | 'subtype' | 'category'> {
  if (/^timed challenge/i.test(title)) return { section: 'challenge', subtype: 'Timed challenge', category: 'assessment' };
  if (/^skills assessment/i.test(title)) return { section: 'scenario', subtype: 'Build to Spec', category: 'assessment' };
  if (/^troubleshoot/i.test(title)) return { section: 'troubleshooting', subtype: /three tickets|ticket queue/i.test(title) ? 'Ticket Queue' : /new switch|inherited/i.test(title) ? 'Inherited Network' : 'Fault Hunt', category: 'scenario' };
  return { section: 'guided', subtype: 'Step-by-step build', category: 'guided' };
}

function challengeTopic(challenge: ChallengeDef) {
  if (/vlan|trunk|port|switch/i.test(challenge.id + challenge.title)) return 'Switching and VLANs';
  if (/gateway|mask|ip|address|dhcp|dns|route/i.test(challenge.id + challenge.title)) return 'IP addressing and routing';
  return 'Troubleshooting fundamentals';
}

function arenaTopic(id: string) {
  const topic = ARENA_TOPICS.find((item) => item.id === id);
  return topic ? `Ch ${topic.chapter} · ${topic.title}` : 'Network operations';
}
function workbookTopic(topic: string) {
  if (/vlan|trunk/i.test(topic)) return 'Ch 8 · VLANs and trunking';
  if (/stp|etherchannel/i.test(topic)) return 'Ch 9 · Spanning Tree and EtherChannel';
  return topic;
}

/** One topic-first library for every lab that opens in the network designer. */
export function LabPicker({ open, onClose, onStart, onChallenge, onArena, onPlayground, initialFilter = 'all', initialView = 'type', initialTopic = null, initialProgress = false, inline = false }: {
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
  const studyTopics = useMemo(() => cert ? certTopics(cert) : ALL_TOPICS, [cert]);
  const studyTopicGroups = useMemo(() => {
    const groups = new Map<string, typeof studyTopics>();
    for (const topic of studyTopics) {
      const course = COURSES.find((item) => item.id === topic.course)?.title.replace(/ \(.*\)$/, '') ?? topic.course;
      const group = `${course} · ${topic.unit}`;
      groups.set(group, [...(groups.get(group) ?? []), topic]);
    }
    return [...groups.entries()];
  }, [studyTopics]);
  const active = useLab((s) => s.doc?.workbook?.id);
  const arenaProgress = useArena();
  const [filter, setFilter] = useState<LibraryKind>(initialFilter);
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('topic');
  const [sectionFilter, setSectionFilter] = useState<SectionId | 'all'>('all');
  const [subtypeFilter, setSubtypeFilter] = useState('all');
  const [showProgress, setShowProgress] = useState(false);
  const [studyTopicId, setStudyTopicId] = useState('');

  const entries = useMemo<Entry[]>(() => {
    const workbooks = WORKBOOKS.map((workbook) => ({
      ...workbookFormat(workbook.title),
      id: workbook.id,
      title: workbook.title,
      topic: workbookTopic(workbook.topic),
      legacyCategory: labCategory(workbook),
      kind: 'workbook' as const,
      goal: workbook.level === 'CCNP' ? 'Interview' : workbook.level === 'SOC' || workbook.level === 'Security' ? 'Job Ready' : 'CCNA Exam',
      level: (workbook.level === 'Foundations' ? 'Beginner' : workbook.level === 'CCNP' ? 'Advanced' : 'Intermediate') as Entry['level'],
      badge: workbook.level,
      description: workbook.intro,
      minutes: workbook.minutes,
      tasks: workbook.tasks.length,
      onSelect: () => onStart(workbook.id),
    }));
    const arena = ARENA_LABS.map((lab) => ({
      id: lab.id,
      title: lab.title,
      topic: arenaTopic(lab.topicId),
      legacyCategory: arenaTopic(lab.topicId),
      kind: 'arena' as const,
      section: ({ guided: 'guided', skills: 'scenario', troubleshoot: 'troubleshooting', challenge: 'challenge' } as const)[lab.kind],
      subtype: lab.kind === 'guided' ? 'Step-by-step build' : lab.kind === 'skills' ? 'Build to Spec' : lab.kind === 'challenge' ? 'Timed challenge' : /three tickets|tickets/i.test(lab.title) ? 'Ticket Queue' : /new switch|inherited/i.test(lab.title) ? 'Inherited Network' : 'Fault Hunt',
      goal: lab.kind === 'challenge' || lab.kind === 'skills' ? 'CCNA Exam' : 'Job Ready',
      level: (lab.difficulty === 1 ? 'Beginner' : lab.difficulty === 2 ? 'Intermediate' : 'Advanced') as Entry['level'],
      category: ARENA_KIND_CATEGORY[lab.kind],
      badge: KIND_LABEL[lab.kind],
      description: lab.brief.split('\n')[0],
      minutes: lab.timeLimit ?? lab.minutes,
      tasks: lab.items.length + lab.tests.length,
      difficulty: lab.difficulty,
      onSelect: () => onArena(lab.id),
    }));
    const challenges = CHALLENGES.map((challenge) => ({
      id: challenge.id,
      title: challenge.title,
      topic: challengeTopic(challenge),
      legacyCategory: 'Troubleshooting tickets',
      kind: 'challenge' as const,
      section: 'troubleshooting' as const,
      subtype: 'Fault Hunt',
      goal: challenge.level === 'CCNP' ? 'Interview' : 'Job Ready',
      level: (challenge.level === 'CCNP' ? 'Advanced' : 'Intermediate') as Entry['level'],
      category: 'scenario' as const,
      badge: `${challenge.level} scenario`,
      description: 'A fault is hidden in the current design. Diagnose it with the canvas, device terminals and packet tools.',
      onSelect: () => onChallenge(challenge.id),
    }));
    const certIds = new Set(cert?.labs ?? []);
    const all = [...workbooks, ...arena, ...challenges];
    // Keep all labs browsable; certification-recommended items are ordered first in the list.
    return all.sort((a, b) => Number(certIds.has(b.id)) - Number(certIds.has(a.id)) || a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
  }, [cert, onArena, onChallenge, onStart]);

  const topics = useMemo(() => [...new Set(entries.map((entry) => entry.topic))].sort((a, b) => a.localeCompare(b)), [entries]);
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    if (!open) return;
    setViewMode(initialView);
    setShowProgress(initialProgress);
    if (initialTopic) {
      const studyTopic = topicById(initialTopic);
      setStudyTopicId(studyTopic ? initialTopic : '');
      const linkedLabId = studyTopic?.lab?.workbook ?? studyTopic?.lab?.challenge;
      const linkedLab = linkedLabId ? entriesRef.current.find((entry) => entry.id === linkedLabId) : undefined;
      const chapter = initialTopic.match(/ch-?(\d+)/i)?.[1];
      const normalized = initialTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const currentTopics = topicsRef.current;
      const match = currentTopics.find((topic) => topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === normalized)
        ?? (chapter ? currentTopics.find((topic) => new RegExp(`^ch\\s*${chapter}\\b`, 'i').test(topic)) : undefined);
      setTopicFilter(linkedLab?.topic ?? match ?? (studyTopic ? '__selected_topic__' : 'all'));
    }
    setSectionFilter('all');
    setSubtypeFilter('all');
  }, [open, initialView, initialTopic, initialProgress]);
  const chooseStudyTopic = (id: string) => {
    setStudyTopicId(id);
    setQuery('');
    if (!id) {
      setTopicFilter('all');
      return;
    }
    const studyTopic = topicById(id);
    const linkedLabId = studyTopic?.lab?.workbook ?? studyTopic?.lab?.challenge;
    const linkedLab = linkedLabId ? entriesRef.current.find((entry) => entry.id === linkedLabId) : undefined;
    setTopicFilter(linkedLab?.topic ?? '__selected_topic__');
  };
  const filtered = entries.filter((entry) => {
    const text = `${entry.title} ${entry.topic} ${entry.description} ${entry.badge}`.toLowerCase();
    return (filter === 'all' || entry.category === filter)
      && (topicFilter === 'all' || entry.topic === topicFilter)
      && (sectionFilter === 'all' || entry.section === sectionFilter)
      && (subtypeFilter === 'all' || entry.subtype === subtypeFilter)
      && (!query.trim() || text.includes(query.trim().toLowerCase()));
  });
  const grouped = new Map<string, Entry[]>();
  for (const entry of filtered) grouped.set(entry.topic, [...(grouped.get(entry.topic) ?? []), entry]);
  const groupedSections = new Map<SectionId, Entry[]>();
  for (const entry of filtered) groupedSections.set(entry.section, [...(groupedSections.get(entry.section) ?? []), entry]);
  const sectionCounts = (id: SectionId) => entries.filter((entry) => entry.section === id).length;
  const renderLabCard = (lab: Entry) => {
    const inProgress = active === lab.id || active === `arena:${lab.id}`;
    return (
      <li key={`${lab.kind}:${lab.id}`}>
        <button type="button" className={cx('group flex h-full w-full flex-col rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-action hover:shadow-lg hover:shadow-action/5 focus-visible:outline-2 focus-visible:outline-action', inProgress ? 'border-action bg-action/10' : 'border-line bg-pane-2/50')} onClick={lab.onSelect} data-testid={`lab-card-${lab.id}`}>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={KIND_TONE[lab.subtype] ?? 'info'}>{lab.subtype}</Badge>
            <Badge tone={KIND_TONE[lab.badge] ?? 'neutral'}>{lab.badge}</Badge>
            <Badge tone="neutral">{lab.level}</Badge>
            {inProgress && <Badge tone="info">In progress</Badge>}
            {lab.difficulty && <span className="ml-auto text-[10.5px] text-faint" aria-label={`Difficulty ${lab.difficulty} of 3`}>{'●'.repeat(lab.difficulty)}{'○'.repeat(3 - lab.difficulty)}</span>}
          </span>
          <span className="mt-2 block text-[13px] leading-snug font-semibold group-hover:text-action">{lab.title}</span>
          <span className="mt-1 line-clamp-3 flex-1 text-[11.5px] leading-relaxed text-muted">{lab.description}</span>
          <span className="mt-2 flex flex-wrap gap-1 text-[10px] text-faint"><span className="rounded border border-line px-1.5 py-0.5">Goal · {lab.goal}</span><span className="rounded border border-line px-1.5 py-0.5">Topic · {lab.topic}</span></span>
          <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[10.5px] text-faint">
            {lab.tasks !== undefined && <span className="inline-flex items-center gap-1"><Wrench className="size-3" />{lab.tasks} checks</span>}
            {lab.minutes !== undefined && <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{lab.minutes} min</span>}
            <span className="ml-auto inline-flex items-center gap-1 text-action">Open playground <span aria-hidden>→</span></span>
          </span>
        </button>
      </li>
    );
  };

  const libraryContent = (
      <div className="space-y-4" data-testid="lab-picker">
        {inline && <header className="flex items-center justify-between border-b border-line pb-2"><div><h2 className="text-[15px] font-semibold">Lab Library</h2><p className="text-[11px] text-muted">Choose a topic or lab type, then select a lab to open its playground.</p></div><Button size="sm" variant="ghost" onClick={onClose} aria-label="Hide lab library"><X className="mr-1 size-4" />Hide</Button></header>}
        <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-action/25 bg-gradient-to-r from-action/10 via-pane to-pane px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-action">Build · practise · prove</p>
            <h2 className="mt-1 text-[17px] font-semibold">{topicById(studyTopicId || initialTopic || '') ? `Choose a lab for ${topicById(studyTopicId || initialTopic || '')!.title}` : 'Choose a lab, then work in the canvas'}</h2>
            <p className="mt-1 max-w-[72ch] text-[12.5px] text-muted">{viewMode === 'topic' ? 'Choose a topic, then choose a lab type below it. The matching labs appear here; select one to open its playground.' : 'Choose a lab type and optionally narrow it to a topic. Select a lab to open its playground and task panel.'}</p>
          </div>
          {cert && <Badge tone="info">Suggested for {cert.short}</Badge>}
        </header>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-pane-2/50 p-2" data-testid="lab-browse-controls">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-ink p-1" role="tablist" aria-label="Browse labs by">
            <button type="button" role="tab" aria-selected={!showProgress && viewMode === 'topic'} onClick={() => { setShowProgress(false); setViewMode('topic'); setSectionFilter('all'); setSubtypeFilter('all'); }} className={cx('rounded-md px-3 py-1.5 text-[12px] font-medium', !showProgress && viewMode === 'topic' ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid="lab-view-topic">By topic</button>
            <button type="button" role="tab" aria-selected={!showProgress && viewMode === 'type'} onClick={() => { setShowProgress(false); setViewMode('type'); setSubtypeFilter('all'); }} className={cx('rounded-md px-3 py-1.5 text-[12px] font-medium', !showProgress && viewMode === 'type' ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid="lab-view-type">By lab type</button>
          </div>
          {viewMode === 'topic' ? (
            <>
              <label className="space-y-0.5"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Choose a topic</span><select className="h-8 min-w-[220px] max-w-[min(72vw,360px)] rounded-[5px] border border-line-strong bg-ink px-2 text-[12px]" value={studyTopicId} onChange={(event) => chooseStudyTopic(event.target.value)} data-testid="lab-topic-picker"><option value="">All topics in {cert?.short ?? 'the course'}</option>{studyTopicGroups.map(([group, topics]) => <optgroup key={group} label={group}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</optgroup>)}</select></label>
              <label className="space-y-0.5"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Choose a lab type</span><select className="h-8 min-w-[190px] rounded-[5px] border border-line-strong bg-ink px-2 text-[12px]" value={sectionFilter} onChange={(event) => { const id = event.target.value as SectionId | 'all'; if (id === 'playground') { onPlayground(); return; } setSectionFilter(id); setSubtypeFilter('all'); }} data-testid="lab-type-picker"><option value="all">All lab types</option>{SECTIONS.map((section) => <option key={section.id} value={section.id}>{section.label}{!section.available ? ' · planned' : ''}</option>)}</select></label>
            </>
          ) : (
            <>
              <label className="space-y-0.5"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Choose a lab type</span><select className="h-8 min-w-[220px] rounded-[5px] border border-line-strong bg-ink px-2 text-[12px]" value={sectionFilter} onChange={(event) => { const id = event.target.value as SectionId | 'all'; if (id === 'playground') { onPlayground(); return; } setSectionFilter(id); setSubtypeFilter('all'); }} data-testid="lab-type-picker"><option value="all">All lab types</option>{SECTIONS.map((section) => <option key={section.id} value={section.id}>{section.label}{!section.available ? ' · planned' : ''}</option>)}</select></label>
              <label className="space-y-0.5"><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Filter by topic</span><select className="h-8 min-w-[220px] max-w-[min(72vw,360px)] rounded-[5px] border border-line-strong bg-ink px-2 text-[12px]" value={studyTopicId} onChange={(event) => chooseStudyTopic(event.target.value)} data-testid="lab-topic-picker"><option value="">All topics in {cert?.short ?? 'the course'}</option>{studyTopicGroups.map(([group, topics]) => <optgroup key={group} label={group}>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</optgroup>)}</select></label>
            </>
          )}
          <div className="ml-auto"><Button size="sm" variant={showProgress ? 'primary' : 'secondary'} onClick={() => setShowProgress((value) => !value)} data-testid="lab-progress">{showProgress ? 'Back to lab library' : 'Lab progress'}</Button></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="max-h-[min(62vh,680px)] space-y-3 overflow-y-auto pr-1">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted" aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics or labs…" aria-label="Search topics or labs" className="h-9 w-full rounded-lg border border-line-strong bg-ink pr-2 pl-9 text-[13px] focus:border-action" data-testid="lab-picker-search" />
            </label>
            <div className="border-t border-line pt-2" aria-label="Explore lab formats">
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Explore labs</p>
              {SECTIONS.map(({ id, label, icon: Icon, available }) => (
                <button key={id} type="button" onClick={() => { if (id === 'playground') { onPlayground(); return; } setStudyTopicId(''); setViewMode('type'); setSectionFilter(id); setSubtypeFilter('all'); setTopicFilter('all'); }} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors', sectionFilter === id && viewMode === 'type' ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`lab-section-${id}`}>
                  <Icon className="size-3.5 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{label}</span>
                  {id === 'playground' ? <span className="text-[10px] text-action">Open</span> : <span className="text-[10px] tabular-nums text-faint">{sectionCounts(id) || (!available ? 'Soon' : '0')}</span>}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-line bg-pane-2/60 p-2.5 text-[11.5px] leading-relaxed text-muted">
              <p className="font-medium text-text">Your playground</p>
              <p className="mt-1">Selecting a lab loads its topology into the canvas. Tasks, checks and results appear beside or below the canvas so you can build while you learn.</p>
            </div>
          </aside>

          <div className="min-w-0 space-y-4" aria-live="polite">
            {showProgress ? <ArenaHome embedded onLaunch={onArena} /> : <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <div>
                <h3 className="text-[14px] font-semibold">{viewMode === 'topic' ? (sectionFilter === 'all' ? 'Labs by topic' : `${SECTIONS.find((item) => item.id === sectionFilter)?.label} by topic`) : sectionFilter === 'all' ? 'Browse by lab type' : SECTIONS.find((item) => item.id === sectionFilter)?.label}</h3>
                <p className="text-[11.5px] text-muted">{filtered.length} available · select a lab to open the canvas and task panel</p>
              </div>
              {(query || topicFilter !== 'all' || studyTopicId || sectionFilter !== 'all' || subtypeFilter !== 'all' || filter !== 'all') && <Button size="sm" variant="ghost" onClick={() => { setQuery(''); setStudyTopicId(''); setTopicFilter('all'); setSectionFilter('all'); setSubtypeFilter('all'); setFilter('all'); }}>Clear filters</Button>}
            </div>

            {filtered.length || (viewMode === 'topic' && topicFilter !== 'all') ? (
              <div className="max-h-[min(58vh,620px)] space-y-5 overflow-y-auto pr-1" data-testid="lab-library-results">
                {(viewMode === 'topic'
                  ? (topicFilter === 'all' ? [...grouped.entries()].map(([topic, labs]) => ({ id: topic, label: topic, labs })) : [{ id: topicFilter, label: topicFilter === '__selected_topic__' ? topicById(studyTopicId || initialTopic || '')?.title ?? 'Selected topic' : topicFilter, labs: grouped.get(topicFilter) ?? [] }])
                  : (sectionFilter === 'all' ? SECTIONS.filter((item) => item.id !== 'playground') : SECTIONS.filter((item) => item.id === sectionFilter)).map((section) => ({ id: section.id, label: section.label, labs: groupedSections.get(section.id) ?? [] }))
                ).map(({ id, label, labs }) => (
                  <section key={id} aria-label={`${label} labs`} data-testid={`lab-group-${String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                    <h4 className="sticky top-0 z-[1] mb-2 flex items-center gap-2 bg-pane py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                      <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
                    </h4>
                    {viewMode === 'topic' && (() => { const topicDef = ARENA_TOPICS.find((topic) => arenaTopic(topic.id) === label); return topicDef ? <p className="mb-2 text-[11px] text-action">Topic mastery: {topicMastery(arenaProgress, labsFor(topicDef.id)).pct}%</p> : null; })()}
                    {viewMode === 'type' && <p className="mb-2 text-[11px] text-muted">{SECTIONS.find((item) => item.id === id)?.description}</p>}
                    {viewMode === 'type' && sectionFilter === id && SUBTYPES[id as SectionId] && <div className="mb-3 flex flex-wrap gap-1.5" aria-label={`${label} subtypes`}>
                      {SUBTYPES[id as SectionId]!.map((subtype) => {
                        const count = entries.filter((entry) => entry.subtype === subtype && entry.section === id).length;
                        return <button key={subtype} type="button" onClick={() => setSubtypeFilter(subtypeFilter === subtype ? 'all' : subtype)} aria-pressed={subtypeFilter === subtype} className={cx('rounded-full border px-2.5 py-1 text-[10.5px] transition-colors', subtypeFilter === subtype ? 'border-action bg-action/15 text-text' : 'border-line text-muted hover:border-action hover:text-text')} data-testid={`lab-subtype-${subtype.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{subtype} <span className="ml-1 text-faint">{count || 'Planned'}</span></button>;
                      })}
                    </div>}
                    {!labs.length && <p className="mb-2 rounded-lg border border-dashed border-line px-3 py-4 text-[12px] text-muted">{SECTIONS.find((item) => item.id === id)?.available ? 'No labs in this format are available yet.' : 'Planned format · labs will appear here when ready.'}</p>}
                    {viewMode === 'topic' ? (
                      <div className="space-y-4">
                        {SECTIONS.filter((section) => section.id !== 'playground' && (sectionFilter === 'all' || section.id === sectionFilter)).map((section) => {
                          const sectionLabs = labs.filter((lab) => lab.section === section.id);
                          return <div key={section.id} data-testid={`lab-topic-section-${section.id}`}>
                            <h5 className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted"><span>{section.label}</span><span className="rounded-full bg-pane-2 px-1.5 py-0.5 text-[10px] tabular-nums">{sectionLabs.length}</span><span className="h-px flex-1 bg-line" /></h5>
                            {sectionLabs.length ? <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{sectionLabs.map(renderLabCard)}</ul> : <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-muted">{section.available ? 'No labs in this format are linked to this topic yet.' : 'Planned format · labs will appear here when ready.'}</p>}
                          </div>;
                        })}
                      </div>
                    ) : <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{labs.map(renderLabCard)}</ul>}
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line-strong p-6 text-center">
                <div><BookOpen className="mx-auto size-6 text-faint" /><p className="mt-2 text-[13px] font-medium">No labs match this topic yet</p><p className="mt-1 text-[12px] text-muted">Try another topic or choose All labs to see the full library.</p></div>
              </div>
            )}
            <p className="text-[11px] text-faint">Labs run in the simulated designer and grade the network design. Starting a lab saves your current design as a layout first.</p>
            </>}
          </div>
        </div>
      </div>
  );
  if (inline) return open ? <section className="max-h-[min(52vh,620px)] shrink-0 overflow-y-auto border-b border-line bg-pane p-3 sm:p-4" aria-label="Lab Library">{libraryContent}</section> : null;
  return <Dialog open={open} onClose={onClose} title="Lab Library" wide>{libraryContent}</Dialog>;
}
