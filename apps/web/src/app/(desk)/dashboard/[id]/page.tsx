'use client';

import { Award, BookOpenText, BrainCircuit, Calculator, ChevronDown, Compass, History, Images, Joystick, Layers, ListChecks, MessagesSquare, MousePointerClick, PanelLeftClose, PanelLeftOpen, Route, ScrollText, Settings2, Siren, Tags, Timer, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import LabPage from '@/app/(desk)/lab/page';
import SettingsPage from '@/app/(desk)/settings/page';
import SkillsPage from '@/app/(desk)/skills/page';
import { CertStrip } from '@/components/cert/CertStrip';
import { dashAccent, sectionOf, SIDE_ITEMS, useDashItem, type DashSection } from '@/components/cert/DashboardSide';
import { GamesView } from '@/components/games/GamesView';
import { Flashcards, TimedExam } from '@/components/learn/Exams';
import { LessonLibrary, LessonReader } from '@/components/learn/Lessons';
import { Interview, LabDrills, Practice, Subnetting } from '@/components/learn/Practice';
import { ScenarioQuestions } from '@/components/learn/ScenarioQuestions';
import { TopicPlayground } from '@/components/learn/Topics';
import { TracksView } from '@/components/learn/Tracks';
import { VisualsView } from '@/components/learn/Visuals';
import { ScenarioLibrary } from '@/components/scenarios/ScenarioLibrary';
import { cx, EmptyState } from '@/components/ui';
import { ToolDialog, TOOLS, toolsFor, type ToolId } from '@/components/learn/StudyTools';
import { allGames } from '@/content';
import { certById, certTopics, CERTS, dashboardById, type Cert } from '@/content/certs';
import type { Track } from '@/learn/api';
import type { TeachLevel, Topic } from '@/content/topics';
import { useUi } from '@/state/ui';
import { setTeachingLevel, useLearningPreferences } from '@/state/learning';

type Part = { key: string; label: string; hint?: string; icon: LucideIcon; hue: string };

// One colour per kind of activity, so the same kind looks the same in every dashboard.
const HUE = { read: '#4f9cf9', see: '#22b8cf', test: '#f59f00', recall: '#ae3ec9', real: '#f03e3e', talk: '#37b24d', ai: '#7950f2', math: '#1098ad', path: '#e8590c', play: '#d6336c', neutral: '#868e96' };

const LEARN_PARTS: Part[] = [
  { key: 'topics', label: 'Learn by topic', hint: 'One topic at a time, at your level', icon: BookOpenText, hue: HUE.read },
  { key: 'images', label: 'Learn with images', hint: 'Diagrams and pictures', icon: Images, hue: HUE.see },
  { key: 'exam', label: 'Practice exam', hint: 'Timed, marked at the end', icon: Timer, hue: HUE.test },
  { key: 'flashcards', label: 'Flashcards', hint: 'Terms to remember', icon: Layers, hue: HUE.recall },
  { key: 'scenario-questions', label: 'Scenario questions', hint: 'Real tickets: cause, fix, escalate', icon: ScrollText, hue: HUE.real },
  { key: 'interview', label: 'Interview mode', hint: 'Answer out loud, get feedback', icon: MessagesSquare, hue: HUE.talk },
  { key: 'ai', label: 'AI practice questions', hint: 'Fresh questions on weak spots', icon: BrainCircuit, hue: HUE.ai },
  { key: 'subnetting', label: 'Subnetting drills', hint: 'Quick address maths', icon: Calculator, hue: HUE.math },
  { key: 'tracks', label: 'Tracks', hint: 'Step-by-step study path', icon: Route, hue: HUE.path },
  { key: 'lessons', label: 'Interactive lessons', hint: 'Guided walk-throughs', icon: Compass, hue: HUE.read },
];

/** Learning mode: how deep the topic explanations go. */
const MODES: { key: TeachLevel; label: string; hint: string }[] = [
  { key: 'simple', label: 'Beginner', hint: 'Plain language and familiar examples' },
  { key: 'technical', label: 'Technical / Expert', hint: 'Expert terms, commands, design choices, and edge cases' },
];

/** Scenario library filter that suits each dashboard (the library's tags combine with AND). */
const SCENARIO_TAGS: Record<string, string[]> = { networking: ['ccna'], security: ['security-plus'], soc: ['soc'], 'it-support': ['it-support'] };

/** The parts listed in the side panel for each section. Labs has its own panel (devices and cables). */
function partsFor(section: DashSection, focus: Cert): Part[] {
  if (section === 'learn') return LEARN_PARTS;
  if (section === 'scenario-lab')
    return [
      { key: 'faults', label: 'Fault scenarios', hint: 'Inject a fault, fix it, debrief', icon: Siren, hue: HUE.real },
      { key: 'drills', label: 'Guided lab drills', hint: 'Workbooks and troubleshooting', icon: ListChecks, hue: HUE.path },
    ];
  if (section === 'games') {
    const games = allGames().filter((g) => focus.games.includes(g.id));
    return [{ key: 'all', label: 'All games', hint: `${games.length} for this area`, icon: Joystick, hue: HUE.play }, ...games.map((g) => ({ key: g.id, label: g.title, hint: `${g.cases.length} tickets`, icon: Joystick, hue: HUE.play }))];
  }
  if (section === 'progress') return [{ key: 'overview', label: 'Overview', hint: 'Domains, next topic, scores', icon: TrendingUp, hue: HUE.talk }];
  if (section === 'skills') return [{ key: 'tree', label: 'Skill tree', hint: 'Proven by closed tickets', icon: Award, hue: HUE.test }];
  if (section === 'settings') return [{ key: 'app', label: 'App settings', icon: Settings2, hue: HUE.neutral }];
  return [];
}

const lastKey = (id: string) => `aegis.dash.last.${id}`;

/** A dashboard: its own icon rail (DashboardSide), a second toolbar, a side panel for the picked section and a playground. */
export default function DashboardPage() {
  const { teach: mode } = useLearningPreferences();
  const { id } = useParams<{ id: string }>();
  const dash = dashboardById(id);
  const focus = certById(id);
  const { item, setItem } = useDashItem();
  const [panel, setPanel] = useState(true);
  const [topicId, setTopicId] = useState<string>('');
  const [topicQuery, setTopicQuery] = useState('');
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [lesson, setLesson] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId | null>(null);
  const topics = useMemo(() => (focus ? certTopics(focus) : []), [focus]);
  const units = useMemo(() => {
    const g: { name: string; list: Topic[] }[] = [];
    for (const t of topics) {
      const f = g.find((x) => x.name === t.unit);
      if (f) f.list.push(t);
      else g.push({ name: t.unit, list: [t] });
    }
    return g;
  }, [topics]);
  const topic = topics.find((t) => t.id === topicId);
  const filteredUnits = useMemo(() => {
    const query = topicQuery.trim().toLowerCase();
    return units
      .map((u) => ({ ...u, list: u.list.filter((t) => !query || `${t.title} ${t.unit} ${t.simple} ${t.terms.map((term) => term.join(' ')).join(' ')}`.toLowerCase().includes(query)) }))
      .filter((u) => u.list.length > 0);
  }, [units, topicQuery]);

  // Opening a dashboard by URL makes it the current focus (once per visit, so switching away is not undone),
  // and restores the picked item from ?item= (older items still open the right place).
  useEffect(() => {
    if (dash && useUi.getState().certId !== dash.id) useUi.getState().setCert(dash.id);
    const p = new URLSearchParams(window.location.search);
    const it = p.get('item');
    const moved: Record<string, string> = { exam: 'learn/exam', flashcards: 'learn/flashcards', scenarios: 'scenario-lab', 'learn/drills': 'scenario-lab/drills' };
    useDashItem.setState({ item: !it || it.startsWith('topic:') ? null : (moved[it] ?? it) });
    setTopicId(p.get('topic') ?? '');
    if (window.innerWidth < 768) setPanel(false);
    try {
      setLast(dash ? window.localStorage.getItem(lastKey(dash.id)) : null);
    } catch {
      /* storage blocked */
    }
  }, [dash]);
  // Remember where you were in this dashboard.
  useEffect(() => {
    if (!dash || !item) return;
    try {
      window.localStorage.setItem(lastKey(dash.id), item);
    } catch {
      /* storage blocked */
    }
  }, [dash, item]);
  if (!dash || !focus) return <EmptyState title="No such dashboard" body="Choose a certification area from the drop-down at the top." />;

  const section = sectionOf(item);
  const parts = section ? partsFor(section, focus) : [];
  const part = item?.split('/').slice(1).join('/') || parts[0]?.key;
  const open = (s: DashSection, p?: string) => setItem(p ? `${s}/${p}` : s);
  const pickTopic = (t: string) => {
    setTopicId(t);
    setLesson(null);
    try {
      const url = new URL(window.location.href);
      if (t) url.searchParams.set('topic', t);
      else url.searchParams.delete('topic');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  };
  const setMode = (m: TeachLevel) => {
    setTeachingLevel(m);
  };
  const openLab = (workbook?: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('workbook');
      url.searchParams.delete('challenge');
      if (workbook) url.searchParams.set(workbook.startsWith('challenge:') ? 'challenge' : 'workbook', workbook.replace(/^challenge:/, ''));
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
    open('labs');
  };
  const studyTopic = (t: string) => {
    pickTopic(t);
    open('learn', 'topics');
  };
  const accent = dashAccent(dash.id);
  const members = dash.certs.map((c) => CERTS.find((k) => k.id === c)!).filter(Boolean);
  const scope = topic ? (`topic:${topic.id}` as const) : undefined;

  // Labs is the full lab designer: its own toolbar on top and the device and cable library on the side.
  if (section === 'labs')
    return (
      <div className="h-full" data-testid={`dashboard-${dash.id}`}>
        <h1 className="sr-only" data-testid="dashboard-title">
          {dash.title}
        </h1>
        <div className="h-full" data-testid="playground-labs">
          <LabPage />
        </div>
      </div>
    );

  const sectionMeta = SIDE_ITEMS.find((s) => s.item === section);
  const lastLabel = last ? `${SIDE_ITEMS.find((s) => s.item === sectionOf(last))?.label ?? ''}${last.includes('/') ? `: ${partsFor(sectionOf(last)!, focus).find((p) => p.key === last.split('/').slice(1).join('/'))?.label ?? ''}` : ''}` : '';
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`dashboard-${dash.id}`}>
      <h1 className="sr-only" data-testid="dashboard-title">
        {dash.title}
      </h1>
      <ToolDialog tool={tool} topic={topic} mode={mode} onClose={() => setTool(null)} />
      <DashToolbar>
        {section && parts.length > 0 && (
          <TB label={panel ? 'Hide side panel' : 'Show side panel'} onClick={() => setPanel(!panel)} testid="dash-panel-toggle">
            {panel ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </TB>
        )}
        {sectionMeta && (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium text-white shadow-sm" style={{ background: accent }} data-testid="dash-toolbar-section">
            <sectionMeta.icon className="size-4" strokeWidth={2.25} /> {sectionMeta.label}
          </span>
        )}
        {section === 'learn' && (
          <>
            <TopicTools topic={topic} tools={toolsFor(dash.id)} onPick={setTool} />
            <Sep />
            <div className="flex flex-wrap items-center gap-1.5" data-testid="dash-topic-mode">
            <div className="relative" data-testid="dash-topic-picker">
              <Tags className="pointer-events-none absolute top-2 left-2 z-10 size-3.5 text-faint" aria-hidden />
              <input
                type="search"
                value={topicPickerOpen ? topicQuery : topic?.title ?? ''}
                onFocus={() => { setTopicPickerOpen(true); setTopicQuery(''); }}
                onChange={(e) => { setTopicQuery(e.target.value); setTopicPickerOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setTopicPickerOpen(false); setTopicQuery(''); }
                  if (e.key === 'Enter' && filteredUnits[0]?.list[0]) { pickTopic(filteredUnits[0].list[0].id); setTopicPickerOpen(false); setTopicQuery(''); }
                }}
                placeholder={`Choose or search ${topics.length} topics…`}
                aria-label="Search and choose a topic"
                aria-expanded={topicPickerOpen}
                aria-controls="dash-topic-options"
                role="combobox"
                className="h-8 w-52 rounded-[6px] border border-line-strong bg-ink pr-2 pl-7 text-[12.5px] placeholder:text-faint focus:border-action focus:outline-none sm:w-64"
                data-testid="dash-topic"
              />
              {topicPickerOpen && (
                <div id="dash-topic-options" role="listbox" className="absolute top-full left-0 z-50 mt-1 max-h-80 w-72 overflow-auto rounded-[7px] border border-[#59728d] bg-[#0b1724] p-1 shadow-xl sm:w-80">
                  {!filteredUnits.length ? <p className="px-3 py-2 text-[12px] text-muted">No matching topics in this certification.</p> : filteredUnits.map((u) => (
                    <div key={u.name}>
                      <p className="px-2 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#b8c8da]">{u.name}</p>
                      {u.list.map((t) => <button key={t.id} type="button" role="option" aria-selected={topicId === t.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { pickTopic(t.id); setTopicPickerOpen(false); setTopicQuery(''); }} className={cx('block w-full rounded px-2 py-1.5 text-left text-[12.5px]', topicId === t.id ? 'bg-action/25 text-white' : 'text-[#f4f7fb] hover:bg-[#1c3044] hover:text-white')}>{t.title}</button>)}
                    </div>
                  ))}
                  {topicQuery.trim() && <p className="px-2 py-1 text-[10.5px] text-[#b8c8da]" aria-live="polite">{filteredUnits.reduce((n, u) => n + u.list.length, 0)} matches</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Learning mode" data-testid="dash-mode">
              <span className="hidden pr-0.5 text-[11.5px] text-faint lg:inline">Mode</span>
              <div className="flex rounded-[6px] border border-line-strong p-0.5">
                {MODES.map((m) => (
                  <button key={m.key} role="radio" aria-checked={mode === m.key} title={m.hint} onClick={() => setMode(m.key)} className={cx('h-6 rounded-[4px] px-2 text-[12px]', mode === m.key ? 'text-white' : 'text-muted hover:text-text')} style={mode === m.key ? { background: accent } : undefined} data-testid={`mode-${m.key}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </>
        )}
        <span className="ml-auto hidden truncate pr-1 text-[12px] text-muted xl:block" title={members.map((m) => m.name).join(', ')}>
          <span className="font-medium text-text">{dash.title}</span> · {members.map((m) => m.short).join(', ')}
        </span>
      </DashToolbar>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        {section && panel && parts.length > 0 && (
          <aside className="shrink-0 border-line bg-pane max-md:border-b md:w-[240px] md:overflow-auto md:border-r" aria-label={`${sectionMeta?.label} parts`} data-testid="dash-panel">
            <p className="px-3 pt-3 pb-1.5 text-[12px] font-semibold max-md:hidden">{sectionMeta?.label}</p>
            <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:overflow-visible md:pt-0">
              {parts.map((p) => {
                const on = part === p.key;
                return (
                  <li key={p.key} className="shrink-0">
                    <button
                      onClick={() => {
                        setLesson(null);
                        open(section, p.key);
                      }}
                      aria-current={on ? 'page' : undefined}
                      className={cx('group flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left', on ? 'bg-pane-2 ring-1 ring-line-strong' : 'hover:bg-pane-2/70')}
                      data-testid={`side-part-${p.key}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-[8px]" style={{ background: `color-mix(in srgb, ${p.hue} ${on ? 30 : 16}%, transparent)`, color: p.hue }} aria-hidden>
                        <p.icon className="size-4" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 whitespace-nowrap md:whitespace-normal">
                        <span className={cx('block text-[13px] leading-tight', on ? 'font-medium text-text' : 'text-muted group-hover:text-text')}>{p.label}</span>
                        {p.hint && <span className="block text-[11px] leading-tight text-faint max-md:hidden">{p.hint}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-testid="dash-playground">
          {!section && (
            <div className="grid h-full place-items-center p-6" data-testid="dashboard-playground-empty">
              <div className="text-center text-muted">
                <MousePointerClick className="mx-auto mb-2 size-8 opacity-50" />
                <p className="text-[14px]">Pick a section from the {dash.title} menu on the left.</p>
                {last && lastLabel && (
                  <button onClick={() => setItem(last)} className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] border border-line-strong px-3 py-1.5 text-[13px] text-text hover:border-action" data-testid="dash-resume">
                    <History className="size-4" /> Continue: {lastLabel}
                  </button>
                )}
              </div>
            </div>
          )}
          {section === 'learn' && (
            <div className="p-4" data-testid="playground-learn">
              {part === 'topics' &&
                (lesson ? (
                  <LessonReader key={lesson} lessonId={lesson} onClose={() => setLesson(null)} />
                ) : topic ? (
                  <TopicPlayground key={topic.id} topicId={topic.id} list={topics} scopeLabel={dash.short} level={mode} onTopic={pickTopic} onOpenLesson={(l) => setLesson(l)} />
                ) : (
                  <div className="grid min-h-[50vh] place-items-center text-center text-muted" data-testid="topic-empty">
                    <div>
                      <Tags className="mx-auto mb-2 size-8 opacity-50" />
                      <p className="text-[14px]">Choose a topic from the drop-down at the top to start learning.</p>
                    </div>
                  </div>
                ))}
              {part === 'images' && <VisualsView onTopic={pickTopic} scope={topics} topicId={topicId} />}
              {part === 'exam' && (
                <div data-testid="playground-exam">
                  <TimedExam key={scope ?? 'all'} scope={scope} onStudy={studyTopic} />
                </div>
              )}
              {part === 'flashcards' && (
                <div data-testid="playground-flashcards">
                  <Flashcards key={scope ?? 'all'} scope={scope} />
                </div>
              )}
              {part === 'scenario-questions' && (
                <div data-testid="playground-scenario-questions">
                  <ScenarioQuestions key={topicId} gameIds={focus.games} topic={topic} />
                </div>
              )}
              {part === 'interview' && <Interview key={mode} initialLevel={mode === 'simple' ? 'entry' : 'senior'} />}
              {part === 'ai' && <Practice key={focus.aiTrack} initialTrack={focus.aiTrack as Track | undefined} />}
              {part === 'subnetting' && <Subnetting />}
              {part === 'tracks' && (
                <TracksView
                  onLesson={(l) => {
                    setLesson(l);
                    open('learn', 'lessons');
                  }}
                  onPractice={() => open('learn', 'ai')}
                />
              )}
              {part === 'lessons' && (lesson ? <LessonReader key={lesson} lessonId={lesson} onClose={() => setLesson(null)} /> : <LessonLibrary onOpen={(l) => setLesson(l)} />)}
            </div>
          )}
          {section === 'scenario-lab' && (
            <div data-testid="playground-scenario-lab">
              {part === 'faults' && <ScenarioLibrary key={dash.id} initialTags={SCENARIO_TAGS[dash.id]} />}
              {part === 'drills' && (
                <div className="p-4">
                  <LabDrills />
                </div>
              )}
            </div>
          )}
          {section === 'games' && (
            <div data-testid="playground-games">
              <GamesView key={part} template={part === 'all' ? undefined : part} />
            </div>
          )}
          {section === 'progress' && (
            <div data-testid="playground-progress">
              <CertStrip />
            </div>
          )}
          {section === 'skills' && (
            <div data-testid="playground-skills">
              <SkillsPage />
            </div>
          )}
          {section === 'settings' && (
            <div data-testid="playground-settings">
              <SettingsPage />
            </div>
          )}
          {(section === 'projects' || section === 'career') && (
            <div className="p-4" data-testid={`playground-${section}`}>
              <EmptyState title={sectionMeta!.label} body={`The ${dash.title} ${sectionMeta!.label.toLowerCase()} space is reserved and will be designed next.`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashToolbar({ children }: { children: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Dashboard tools" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-pane px-2 py-1" data-testid="dash-toolbar">
      {children}
    </div>
  );
}

function TB({ label, onClick, active, children, testid }: { label: string; onClick: () => void; active?: boolean; children: ReactNode; testid?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} title={label} data-testid={testid} className={cx('inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[12.5px]', active ? 'bg-action/15 text-action ring-1 ring-action/50' : 'text-muted hover:bg-pane-2 hover:text-text')}>
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

/** Study and reference tools: notes, read aloud, timer, calculators and converters that suit this dashboard. */
function TopicTools({ topic, tools, onPick }: { topic?: Topic; tools: { study: ToolId[]; reference: ToolId[] }; onPick: (t: ToolId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const row = (id: ToolId) => {
    const t = TOOLS[id];
    const disabled = !!t.needsTopic && !topic;
    return (
      <li key={id}>
        <button
          role="menuitem"
          disabled={disabled}
          title={disabled ? 'Choose a topic first' : t.hint}
          onClick={() => {
            setOpen(false);
            onPick(id);
          }}
          className="flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left hover:bg-pane-2 disabled:opacity-40 disabled:hover:bg-transparent"
          data-testid={`topic-tool-${id}`}
        >
          <t.icon className="size-4 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block text-[13px]">{t.label}</span>
            <span className="block text-[11px] text-faint">{disabled ? 'Choose a topic first' : t.hint}</span>
          </span>
        </button>
      </li>
    );
  };
  return (
    <div ref={ref} className="relative">
      <TB label="Topic tools" onClick={() => setOpen(!open)} active={open} testid="dash-topic-tools">
        <Wrench className="size-4" /> Tools <ChevronDown className="size-3.5" />
      </TB>
      {open && (
        <div role="menu" className="absolute top-9 left-0 z-30 w-[270px] rounded-[8px] border border-line-strong bg-pane p-1 shadow-lg" data-testid="topic-tools-menu">
          <p className="px-2 pt-1 pb-1 text-[11.5px] font-medium text-faint">Study</p>
          <ul>{tools.study.map(row)}</ul>
          <div className="my-1 h-px bg-line" />
          <p className="px-2 pt-1 pb-1 text-[11.5px] font-medium text-faint">Reference</p>
          <ul>{tools.reference.map(row)}</ul>
        </div>
      )}
    </div>
  );
}
