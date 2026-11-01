'use client';

import { useReactFlow } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { FolderOpen, Info, PlayCircle, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTopology } from '@/api/hooks';
import type { Topology } from '@/api/types';
import { useRuntime } from '@/components/providers';
import { LabCanvas, LabFlowProvider, type CanvasActions } from '@/components/lab/LabCanvas';
import { Palette, PaletteStrip, type PaletteFocus } from '@/components/lab/Palette';
import { Toolbar } from '@/components/lab/Toolbar';
import type { ToolKey } from '@/components/lab/ToolsPanel';
import { Button, cx, Dialog, ErrorState, Field, IconButton, Input, Loading, relTime } from '@/components/ui';
import { ARENA_PREFIX, arenaLab, startsBlank } from '@/lab/arena';
import { startArena, useArenaUi } from '@/lab/arena/session';
import { ARENA_LABS, ARENA_TOPICS } from '@/lab/arena';
import { CHALLENGES, prepareChallenge } from '@/lab/challenges';
import { buildDoc, emptyDoc } from '@/lab/inventory';
import { useLabProject } from '@/components/lab/projectContext';
import { setFresh, useLab } from '@/lab/store';
import type { CableEnd, LabDoc } from '@/lab/types';
import { deviceById } from '@/lab/validate';
import { initialLab, type LabState as MockLab } from '@/mock/lab';
import { WORKBOOKS } from '@/lab/workbooks';

const BASELINE_KEY = 'aegis.lab.baseline.v1:live-topology';
const PanelLoading = () => <div className="grid min-h-24 place-items-center text-[12px] text-muted" role="status">Loading…</div>;
const CableInspector = dynamic(() => import('@/components/lab/Inspector').then((module) => module.CableInspector), { loading: PanelLoading });
const DeviceInspector = dynamic(() => import('@/components/lab/Inspector').then((module) => module.DeviceInspector), { loading: PanelLoading });
const VmDialog = dynamic(() => import('@/components/lab/Inspector').then((module) => module.VmDialog), { loading: PanelLoading });
const DiffPanel = dynamic(() => import('@/components/lab/LabDialogs').then((module) => module.DiffPanel), { loading: PanelLoading });
const LayoutsDialog = dynamic(() => import('@/components/lab/LabDialogs').then((module) => module.LayoutsDialog), { loading: PanelLoading });
const ReplaceCableDialog = dynamic(() => import('@/components/lab/LabDialogs').then((module) => module.ReplaceCableDialog), { loading: PanelLoading });
const ShortcutsDialog = dynamic(() => import('@/components/lab/LabDialogs').then((module) => module.ShortcutsDialog), { loading: PanelLoading });
const StructureDialog = dynamic(() => import('@/components/lab/LabDialogs').then((module) => module.StructureDialog), { loading: PanelLoading });
const NewCableDialog = dynamic(() => import('@/components/lab/Pickers').then((module) => module.NewCableDialog), { loading: PanelLoading });
const SimPanel = dynamic(() => import('@/components/lab/SimPanel').then((module) => module.SimPanel), { loading: PanelLoading });
const ToolsPanel = dynamic(() => import('@/components/lab/ToolsPanel').then((module) => module.ToolsPanel), { loading: PanelLoading });
const ArenaPanel = dynamic(() => import('@/components/arena/ArenaPanel').then((module) => module.ArenaPanel), { loading: PanelLoading });
const TerminalDock = dynamic(() => import('@/components/arena/TerminalDock').then((module) => module.TerminalDock), { ssr: false });
function loadWorkbook(id: string, fit?: () => void) {
  void import('@/components/lab/WorkbooksTab').then(({ startWorkbookById }) => startWorkbookById(id, fit));
}

function liveBaseline(fresh: LabDoc): LabDoc {
  try {
    const raw = window.localStorage.getItem(BASELINE_KEY);
    if (raw) return JSON.parse(raw) as LabDoc;
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify(fresh));
  } catch {
    /* storage blocked: use the first document of this session */
  }
  return fresh;
}

/**
 * The lab designer. Inside the dashboard's Projects section (LabProjectContext) it is a personal
 * project workspace: same device and cable library, canvas and consoles, but it starts blank,
 * saves under its own key and has no lab picker.
 */
export default function LabPage() {
  const project = useLabProject();
  const rt = useRuntime();
  const topo = useTopology('all');
  const ready = useLab((s) => !!s.doc);
  const inited = useRef(false);
  const [lab, setLab] = useState<MockLab | null>(null);

  useEffect(() => {
    if (!project || inited.current) return;
    inited.current = true;
    useLab.getState().init(`project:${project}`, emptyDoc(), emptyDoc());
  }, [project]);

  useEffect(() => {
    if (project || !topo.data) return;
    const snapshot = rt.mock ? rt.mock.labSnapshot() : null;
    setLab(snapshot);
    const fresh = buildDoc(topo.data as Topology, snapshot);
    if (!inited.current) {
      inited.current = true;
      const baseline = rt.mock ? buildDoc(topo.data as Topology, initialLab()) : liveBaseline(fresh);
      useLab.getState().init(fresh.source, fresh, baseline);
    } else setFresh(fresh);
  }, [topo.data, rt.mock, project]);

  if (topo.error && !project) return <ErrorState error={topo.error} retry={() => topo.refetch()} />;
  if (!ready) return <Loading rows={8} />;
  return (
    <LabFlowProvider>
      <Designer lab={lab} project={project} />
    </LabFlowProvider>
  );
}

function Banner({ tone = 'info', children, onClose }: { tone?: 'info' | 'warn'; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className={cx('flex items-center gap-2 border-b px-3 py-1.5 text-[12.5px]', tone === 'warn' ? 'border-degraded/40 bg-degraded/10' : 'border-line bg-pane-2/60 text-muted')} role="status">
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <IconButton label="Dismiss" onClick={onClose}>
          <X className="size-3.5" />
        </IconButton>
      )}
    </div>
  );
}

type LabBrowseItem = { id: string; title: string; topic: string; type: string; kind: 'workbook' | 'arena' | 'challenge' };
type LabActivity = 'Configuration' | 'Troubleshooting' | 'Verification & Analysis';

function activityFor(item: LabBrowseItem): LabActivity {
  if (item.type === 'Simlet Labs') return 'Verification & Analysis';
  if (item.type === 'Troubleshooting Labs' || item.kind === 'challenge') return 'Troubleshooting';
  return 'Configuration';
}

function getLabBrowseItems(): LabBrowseItem[] {
  const workbookItems = WORKBOOKS.map((workbook) => ({
    id: workbook.id,
    title: workbook.title,
    topic: workbook.topic,
    kind: 'workbook' as const,
    type: /^timed challenge/i.test(workbook.title) ? 'Challenge Labs' : /^skills assessment/i.test(workbook.title) ? 'Scenario Labs' : /^troubleshoot/i.test(workbook.title) ? 'Troubleshooting Labs' : 'Guided Labs',
  }));
  const arenaItems = ARENA_LABS.map((lab) => ({
    id: lab.id,
    title: lab.title,
    topic: (() => { const topic = ARENA_TOPICS.find((entry) => entry.id === lab.topicId); return topic ? `Ch ${topic.chapter} · ${topic.title}` : 'Network operations'; })(),
    kind: 'arena' as const,
    type: ({ guided: 'Guided Labs', skills: 'Scenario Labs', troubleshoot: 'Troubleshooting Labs', challenge: 'Challenge Labs', simlet: 'Simlet Labs' } as const)[lab.kind],
  }));
  const challengeItems = CHALLENGES.map((challenge) => ({
    id: challenge.id,
    title: challenge.title,
    topic: /vlan|trunk|port|switch/i.test(challenge.id + challenge.title) ? 'Switching and VLANs' : /gateway|mask|ip|address|dhcp|dns|route/i.test(challenge.id + challenge.title) ? 'IP addressing and routing' : 'Troubleshooting fundamentals',
    kind: 'challenge' as const,
    type: 'Troubleshooting Labs',
  }));
  return [...workbookItems, ...arenaItems, ...challengeItems];
}

function LabSelectionBar({ items, onLaunch, onOpenBuild }: { items: LabBrowseItem[]; onLaunch: (item: LabBrowseItem) => void; onOpenBuild: () => void }) {
  const [view, setView] = useState<'type' | 'topic' | 'build'>('type');
  const [selection, setSelection] = useState('');
  const [activity, setActivity] = useState<LabActivity | ''>('');
  const [topicSelection, setTopicSelection] = useState('');
  const activities: LabActivity[] = ['Configuration', 'Troubleshooting', 'Verification & Analysis'];
  const topics = [...new Set(items.map((item) => item.topic))].sort((a, b) => a.localeCompare(b));
  const visibleItems = items.filter((item) => (!activity || activityFor(item) === activity) && (view !== 'topic' || !topicSelection || item.topic === topicSelection));
  const orderedItems = view === 'topic' ? [...visibleItems].sort((a, b) => a.title.localeCompare(b.title)) : [...visibleItems].sort((a, b) => activityFor(a).localeCompare(activityFor(b)) || a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
  const launchSelected = (value: string) => {
    if (!value) return;
    const [kind, ...idParts] = value.split(':');
    const item = items.find((entry) => entry.kind === kind && entry.id === idParts.join(':'));
    if (item) onLaunch(item);
    setSelection('');
  };

  return <>
  <nav className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-pane px-3" aria-label="Lab selector" data-testid="lab-workspace-tabs">
    <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-line-strong bg-ink p-0.5" role="tablist" aria-label="Organize labs by">
      <button type="button" role="tab" aria-selected={view === 'type'} onClick={() => { setView('type'); setSelection(''); setActivity(''); setTopicSelection(''); }} className={cx('h-full whitespace-nowrap rounded px-2.5 text-[12px] font-medium', view === 'type' ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid="lab-view-type">By lab type</button>
      <button type="button" role="tab" aria-selected={view === 'topic'} onClick={() => { setView('topic'); setSelection(''); setActivity(''); setTopicSelection(''); }} className={cx('h-full whitespace-nowrap rounded px-2.5 text-[12px] font-medium', view === 'topic' ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid="lab-view-topic">By topic</button>
      <button type="button" role="tab" aria-selected={view === 'build'} onClick={() => { setView('build'); setSelection(''); onOpenBuild(); }} className={cx('h-full whitespace-nowrap rounded px-2.5 text-[12px] font-medium', view === 'build' ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid="lab-view-drag-drop" title="Open the topology canvas and device palette">Build Lab · Drag &amp; Drop</button>
    </div>
    {view === 'build' ? (
      <p className="min-w-0 truncate text-[11px] text-muted" role="status" data-testid="lab-drag-drop-help">Drag devices from the Devices panel onto the canvas, then use Cable to connect their ports.</p>
    ) : (
      <>
        {view === 'topic' && <>
          <label className="sr-only" htmlFor="lab-topic-selector">Choose a networking topic</label>
          <select id="lab-topic-selector" value={topicSelection} onChange={(event) => { setTopicSelection(event.target.value); setSelection(''); setActivity(''); }} className="h-8 min-w-[min(42vw,250px)] rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" data-testid="lab-topic-selector">
            <option value="">Choose a topic…</option>
            {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
          </select>
        </>}
        <label className="sr-only" htmlFor="lab-activity-selector">Choose a lab activity</label>
        <select id="lab-activity-selector" value={activity} onChange={(event) => { setActivity(event.target.value as LabActivity | ''); setSelection(''); }} className="h-8 min-w-[min(42vw,245px)] rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" data-testid="lab-activity-selector" disabled={view === 'topic' && !topicSelection}>
          <option value="">{view === 'topic' && !topicSelection ? 'Choose a topic first…' : 'All lab activities'}</option>
          {activities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="sr-only" htmlFor="lab-view-selector">Choose a lab assignment</label>
        <select id="lab-view-selector" value={selection} onChange={(event) => launchSelected(event.target.value)} className="h-8 min-w-[min(52vw,420px)] rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" data-testid="lab-view-selector" disabled={view === 'topic' && !topicSelection}>
          <option value="">{view === 'topic' && !topicSelection ? 'Select a topic to see its labs…' : 'Choose a lab to open…'}</option>
          {orderedItems.map((item) => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{view === 'type' ? `${activityFor(item)} › ${item.topic} › ${item.title}` : `${item.title} › ${item.type}`}</option>)}
        </select>
      </>
    )}
  </nav>
  </>;
}

function Designer({ lab, project }: { lab: MockLab | null; project?: string }) {
  const rt = useRuntime();
  const rf = useReactFlow();
  const s = useLab();
  const doc = s.doc!;
  const [palette, setPalette] = useState(true);
  const [paletteFocus, setPaletteFocus] = useState<PaletteFocus>(null);
  const [layouts, setLayouts] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectMessage, setProjectMessage] = useState('');
  const [structure, setStructure] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [newCable, setNewCable] = useState<{ a?: CableEnd } | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [vmFor, setVmFor] = useState<string | null>(null);
  const [simOpen, setSimOpenRaw] = useState(false);
  const [tools, setTools] = useState<ToolKey | null>(null);
  const setSimOpen = (v: boolean) => {
    setSimOpenRaw(v);
    if (v) setTools(null);
  };
  const [hideSource, setHideSourceState] = useState(false);
  const setHideSource = (v: boolean) => {
    setHideSourceState(v);
    try {
      window.localStorage.setItem('aegis.lab.hideSourceBanner', v ? '1' : '0');
    } catch {}
  };
  // Narrow screens: start with the device library closed so the canvas has room. The workspace note shows once; after that it lives behind the ⓘ button.
  useEffect(() => {
    if (window.innerWidth < 1280) setPalette(false);
    try {
      if (window.localStorage.getItem('aegis.lab.hideSourceBanner') === '1') setHideSourceState(true);
    } catch {}
  }, []);
  const stale = useMemo(() => s.staleCount(), [s, s.fresh, s.doc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking a single device or cable opens its inspector.
  const selKey = `${s.selection.devices.join(',')}|${s.selection.cables.join(',')}`;
  useEffect(() => {
    const st = useLab.getState();
    if (st.tool !== 'select') return;
    if (st.selection.devices.length === 1 && !st.selection.cables.length) st.openInspector(st.inspectorTab === 'cable' ? 'overview' : undefined);
    else if (st.selection.cables.length === 1 && !st.selection.devices.length) st.openInspector('cable');
    else if (!st.selection.devices.length && !st.selection.cables.length) st.closeInspector();
  }, [selKey, s.tool]);

  // /lab?workbook=<id> and /lab?challenge=<id> (from the Learn page) start a guided lab or a drill.
  useEffect(() => {
    if (project) return; // project workspaces ignore lab links in the URL
    const params = new URLSearchParams(window.location.search);
    const arena = params.get('arena');
    if (arena) {
      window.history.replaceState(null, '', window.location.pathname);
      if (useLab.getState().doc?.workbook?.id !== ARENA_PREFIX + arena) startArena(arena);
      return;
    }
    const wb = params.get('workbook');
    if (wb) {
      window.history.replaceState(null, '', window.location.pathname);
      if (useLab.getState().doc?.workbook?.id !== wb) loadWorkbook(wb);
      setTools('labs');
      return;
    }
    const pack = params.get('pack');
    if (pack) {
      window.history.replaceState(null, '', window.location.pathname);
      // Legacy saved-pack deep links are intentionally ignored; the Lab Library was removed.
      return;
    }
    const id = params.get('challenge');
    if (!id) return;
    window.history.replaceState(null, '', window.location.pathname);
    const st = useLab.getState();
    if (!st.doc || st.doc.challenge) {
      setTools('challenge');
      return;
    }
    const p = prepareChallenge(st.doc, id);
    if (p) st.startChallenge({ title: p.def.title, brief: p.brief, fault: p.fault }, p.apply);
    setTools('challenge');
  }, []);

  useEffect(() => {
    if (s.tool === 'simulate') setSimOpen(true);
  }, [s.tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.closest('.xterm')) setShortcuts(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const actions: CanvasActions = {
    openTerminal: (id) => {
      if (arenaId) {
        useArenaUi.getState().openTerm(id);
        return;
      }
      s.select({ devices: [id], cables: [] });
      s.openInspector('terminal');
    },
    openVm: (id) => setVmFor(id),
    pingFrom: (id) => {
      s.setView({ simSrc: id, simDst: '' });
      setSimOpen(true);
    },
    replaceCable: (id) => setReplace(id),
    newCable: (a) => setNewCable({ a }),
  };

  const arenaId = doc.workbook?.id.startsWith(ARENA_PREFIX) ? doc.workbook.id.slice(ARENA_PREFIX.length) : null;
  // Every Arena lab (and every restart) opens with the whole topology in view.
  const arenaStart = doc.workbook?.startedAt;
  useEffect(() => {
    // Build labs need the device library; troubleshooting and simlets start with it closed.
    const lab = arenaId ? arenaLab(arenaId) : undefined;
    if (lab) setPalette(startsBlank(lab));
  }, [arenaId]);
  useEffect(() => {
    if (!arenaId) return;
    const t = [150, 700].map((ms) => setTimeout(() => rf.fitView({ padding: 0.12, duration: 250 }), ms));
    return () => t.forEach(clearTimeout);
  }, [arenaId, arenaStart, rf]);
  const selDevice = s.selection.devices.length === 1 ? deviceById(doc, s.selection.devices[0]) : undefined;
  const selCable = s.selection.cables.length === 1 ? doc.cables.find((c) => c.id === s.selection.cables[0]) : undefined;
  const showInspector = s.inspectorOpen && (selDevice || selCable);
  const vmDevice = vmFor ? deviceById(doc, vmFor) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="lab-designer">
      {project && <section className="flex flex-wrap items-center gap-3 border-b border-line bg-pane-2/60 px-3 py-2" aria-label="Networking project workspace" data-testid="project-workspace-nav">
        <div className="mr-auto min-w-40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-action">Networking · CCNA · CCNP</p>
          <h2 className="text-[13px] font-semibold">{s.layoutName ?? 'Current project'}</h2>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setLayouts(true)} data-testid="project-my-projects"><FolderOpen className="mr-1.5 size-4" />My Projects</Button>
        <Button size="sm" variant="primary" onClick={() => { setNewProjectName(''); setProjectMessage(''); setNewProjectOpen(true); }} data-testid="project-new"><Plus className="mr-1.5 size-4" />New Project</Button>
        <Button size="sm" variant="secondary" title="Return to the project you are currently building" onClick={() => {
          setLayouts(false);
          setNewProjectOpen(false);
          setTools(null);
          setSimOpenRaw(false);
          s.setTool('select');
          s.closeInspector();
          requestAnimationFrame(() => rf.fitView({ padding: 0.12, duration: 250 }));
        }} data-testid="project-in-progress"><PlayCircle className="mr-1.5 size-4" />In Progress</Button>
      </section>}
      {!project && <LabSelectionBar items={getLabBrowseItems()} onOpenBuild={() => {
        setPalette(true);
        setTools(null);
        setSimOpenRaw(false);
        setLayouts(false);
        setStructure(false);
        setShortcuts(false);
        s.setTool('select');
        s.closeInspector();
      }} onLaunch={(item) => {
        if (item.kind === 'workbook') {
          loadWorkbook(item.id, () => rf.fitView({ padding: 0.15, duration: 250 }));
          setTools('labs');
          setSimOpenRaw(false);
        } else if (item.kind === 'arena') {
          if (startArena(item.id)) {
            setTools(null);
            setSimOpenRaw(false);
            if (s.tool === 'simulate') s.setTool('select');
          }
        } else {
          const st = useLab.getState();
          if (st.doc?.workbook) st.endWorkbook();
          const current = useLab.getState();
          if (current.doc?.challenge) current.endChallenge();
          const challenge = current.doc ? prepareChallenge(current.doc, item.id) : null;
          if (challenge) {
            current.startChallenge({ title: challenge.def.title, brief: challenge.brief, fault: challenge.fault }, challenge.apply);
            setTimeout(() => rf.fitView({ padding: 0.15, duration: 250 }), 150);
          } else current.setError({ title: 'This troubleshooting lab needs a connected PC. Add a PC to a switch and try again.', issues: [], tone: 'error' });
          setTools('challenge');
          setSimOpenRaw(false);
        }
      }} />}
      <Toolbar paletteOpen={palette} setPaletteOpen={setPalette} onLayouts={() => setLayouts(true)} onStructure={() => setStructure(true)} onShortcuts={() => setShortcuts(true)} onNewCable={() => setNewCable({})} toolsOpen={!!tools} onTools={() => {
          if (tools) setTools(null);
          else {
            setTools(useLab.getState().doc?.workbook ? 'labs' : 'audit');
            setSimOpenRaw(false);
            if (s.tool === 'simulate') s.setTool('select');
          }
        }} />
      {!hideSource && (
        <Banner onClose={() => setHideSource(true)}>
          {doc.source === 'simulated-lab' ? (
            <>
              <span className="font-medium text-text">Simulated lab.</span> Devices, ports, VLANs, leases and firewall rules are read from the built-in lab, so injected faults show up on the canvas. Consoles are simulated shells.
            </>
          ) : project ? (
            <>
              <span className="font-medium text-text">Project workspace.</span> Build your own network with the device and cable library. Projects save in this browser, separate from your labs, and have no grading.
            </>
          ) : doc.source === 'blank' ? (
            <>
              <span className="font-medium text-text">Open playground.</span> Start from a blank canvas, add devices, connect ports and build your own network. This design autosaves in your browser and has no grading.
            </>
          ) : (
            <>
              <span className="font-medium text-text">Live back end.</span> Devices and links come from GET /topology. That contract has no ports, MACs or routes, so cable ports are inferred and MACs show as not reported. Edits stay in this design and do not change the lab. Terminals and VM consoles open real sessions through the back end, or say why they cannot.
            </>
          )}
          {s.layoutName && <span className="ml-2 text-faint">Layout: {s.layoutName}</span>}
        </Banner>
      )}
      {stale > 0 && (
        <Banner tone="warn">
          The lab has changed since this design was {s.restoredAt ? `saved ${relTime(s.restoredAt)}` : 'loaded'}: {stale} difference{stale === 1 ? '' : 's'} on lab devices.{' '}
          <Button size="sm" className="ml-2" onClick={s.refreshFromLab} data-testid="refresh-from-lab">
            Refresh from lab
          </Button>
        </Banner>
      )}
      <div className={cx('relative flex min-h-0 flex-1', arenaId && 'max-xl:flex-col')}>
        {palette ? (
          <aside className="w-[216px] shrink-0 border-r border-line bg-pane max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-20 max-xl:shadow-xl max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:z-40 max-md:h-[46vh] max-md:w-full max-md:rounded-t-xl max-md:border-t max-md:border-r-0 max-md:shadow-2xl" data-testid="palette-panel">
            <div className="hidden justify-center pt-1.5 max-md:flex">
              <button type="button" className="h-1.5 w-10 rounded-full bg-line-strong" aria-label="Close the device library" onClick={() => setPalette(false)} />
            </div>
            <div className="h-full min-h-0 max-md:h-[calc(100%-12px)]">
              <Palette focus={paletteFocus} onCollapse={() => setPalette(false)} />
            </div>
          </aside>
        ) : (
          <aside className="w-11 shrink-0 border-r border-line bg-pane max-md:hidden">
            <PaletteStrip
              onOpen={(f) => {
                setPaletteFocus(f);
                setPalette(true);
              }}
            />
          </aside>
        )}
        <main className={cx('relative min-w-0 flex-1', arenaId && 'max-xl:h-[min(56vh,560px)] max-xl:min-h-[360px] max-xl:flex-none')} aria-label="Canvas">
          <LabCanvas actions={actions} />
          {hideSource && (
            <button type="button" onClick={() => setHideSource(false)} className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-full border border-line bg-pane/90 text-muted shadow-sm hover:text-text" title="About this workspace" aria-label="About this workspace" data-testid="workspace-info">
              <Info className="size-3.5" />
            </button>
          )}
          {arenaId && <TerminalDock />}
        </main>
        {s.compare && (
          <aside className="w-[300px] shrink-0 border-l border-line bg-pane max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:shadow-xl">
            <DiffPanel
              onPick={(d) => {
                if (d.deviceId && deviceById(doc, d.deviceId)) s.select({ devices: [d.deviceId], cables: [] });
                else if (d.cableId && doc.cables.some((c) => c.id === d.cableId)) s.select({ devices: [], cables: [d.cableId] });
              }}
            />
          </aside>
        )}
        {arenaId && <ArenaPanel key={arenaId} labId={arenaId} />}
        {showInspector && (
          <aside className="flex w-[430px] shrink-0 flex-col border-l border-line bg-pane max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-[min(430px,100%)] max-xl:shadow-xl" aria-label="Inspector" data-testid="inspector">
            <header className="flex items-center justify-between border-b border-line px-3 py-2">
              <h2 className="truncate text-[13px] font-semibold">{selDevice ? selDevice.name : 'Cable'}</h2>
              <IconButton label="Close inspector" onClick={s.closeInspector}>
                <X className="size-4" />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1">
              {selDevice ? (
                <DeviceInspector device={selDevice} doc={doc} lab={lab} onPing={actions.pingFrom} />
              ) : selCable ? (
                <div className="h-full overflow-auto p-3">
                  <CableInspector cable={selCable} doc={doc} />
                </div>
              ) : null}
            </div>
          </aside>
        )}
      </div>
      {simOpen && (
        <div className="h-[300px] shrink-0 max-md:h-[50vh]">
          <SimPanel
            onClose={() => {
              setSimOpen(false);
              if (s.tool === 'simulate') s.setTool('select');
            }}
          />
        </div>
      )}
      {tools && !simOpen && (
        <div className="h-[320px] shrink-0 max-md:h-[55vh]">
          <ToolsPanel tab={tools} setTab={setTools} onClose={() => setTools(null)} />
        </div>
      )}
      {layouts && <LayoutsDialog open projectMode={!!project} onClose={() => setLayouts(false)} />}
      {project && <>
        <Dialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} title="Create a new project">
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const name = newProjectName.trim();
            const st = useLab.getState();
            if (!name) return;
            if (st.layouts().some((item) => item.name.toLowerCase() === name.toLowerCase())) {
              setProjectMessage('A project with that name already exists. Choose another name or open it from My Projects.');
              return;
            }
            const hasWork = !!st.doc && (
              st.doc.devices.length > 0 || st.doc.cables.length > 0 || st.doc.sites.length > 0 || st.doc.racks.length > 0
              || st.doc.vlans.length > 0 || st.doc.subnets.length > 0 || st.doc.groups.length > 0
              || !!st.doc.annotations?.length || !!st.doc.goals?.length || !!st.doc.challenge || !!st.doc.workbook
            );
            if (st.layoutName || hasWork) {
              const snapshotName = st.layoutName || `Autosaved project · ${new Date().toLocaleString()}`.slice(0, 60);
              if (!st.saveLayout(snapshotName)) {
                setProjectMessage('The current project could not be saved. Free browser storage before starting another project.');
                return;
              }
            }
            // Detach the old name before clearing the canvas, so its autosave
            // cannot replace that saved project with the new blank workspace.
            useLab.setState({ layoutName: null });
            st.commit('Create project', (next) => {
              for (const key of Object.keys(next) as (keyof LabDoc)[]) if (key !== 'version') delete (next as Partial<LabDoc>)[key];
              Object.assign(next, emptyDoc());
            });
            const fresh = useLab.getState();
            fresh.clearSelection();
            fresh.setTool('select');
            fresh.clearTraces();
            fresh.closeInspector();
            fresh.setError(null);
            useArenaUi.setState({ terms: [], activeTerm: null, termOpen: false, resultsOpen: false, submitted: null });
            if (!fresh.saveLayout(name)) {
              setProjectMessage('A blank workspace opened, but the project could not be saved. Check browser storage.');
              return;
            }
            setTools(null);
            setSimOpenRaw(false);
            setPalette(true);
            setNewProjectOpen(false);
            setTimeout(() => rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 }), 100);
          }}>
            <Field label="Project name"><Input autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Branch office network" aria-label="New project name" data-testid="new-project-name" /></Field>
            {projectMessage && <p role="alert" className="text-[12px] text-down">{projectMessage}</p>}
            <p className="text-[12px] text-muted">Your project opens on a blank canvas and saves in this browser. Existing work is saved before a new project starts.</p>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setNewProjectOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!newProjectName.trim()} data-testid="new-project-create">Create project</Button></div>
          </form>
        </Dialog>
      </>}
      {structure && <StructureDialog open onClose={() => setStructure(false)} />}
      {shortcuts && <ShortcutsDialog open onClose={() => setShortcuts(false)} />}

      {newCable && <NewCableDialog open onClose={() => setNewCable(null)} initial={newCable} />}
      {replace && <ReplaceCableDialog cableId={replace} onClose={() => setReplace(null)} />}
      {vmDevice && <VmDialog device={vmDevice} open onClose={() => setVmFor(null)} />}
      {!rt.mock && <span className="sr-only">Live mode</span>}
    </div>
  );
}
