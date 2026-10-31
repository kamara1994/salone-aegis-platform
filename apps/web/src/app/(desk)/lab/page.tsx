'use client';

import { useReactFlow } from '@xyflow/react';
import dynamic from 'next/dynamic';
import { loadPacks } from '@/content/progress';
import { ChartNoAxesCombined, FolderOpen, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTopology } from '@/api/hooks';
import type { Topology } from '@/api/types';
import { useRuntime } from '@/components/providers';
import { LabCanvas, LabFlowProvider, type CanvasActions } from '@/components/lab/LabCanvas';
import { Palette } from '@/components/lab/Palette';
import { Toolbar } from '@/components/lab/Toolbar';
import type { ToolKey } from '@/components/lab/ToolsPanel';
import { Button, cx, Dialog, ErrorState, Field, IconButton, Input, Loading, relTime } from '@/components/ui';
import { ARENA_PREFIX } from '@/lab/arena';
import { startArena, useArenaUi } from '@/lab/arena/session';
import { updateArena } from '@/lab/arena/progress';
import { prepareChallenge } from '@/lab/challenges';
import { buildDoc, emptyDoc } from '@/lab/inventory';
import { useLabProject } from '@/components/lab/projectContext';
import { setFresh, useLab } from '@/lab/store';
import type { CableEnd, LabDoc } from '@/lab/types';
import { deviceById } from '@/lab/validate';
import { initialLab, type LabState as MockLab } from '@/mock/lab';

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
const LabPicker = dynamic(() => import('@/components/lab/LabPicker').then((module) => module.LabPicker), { loading: PanelLoading });

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

function ProjectProgressDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useLab();
  const doc = state.doc;
  const projects = state.layouts();
  const linkedDevices = new Set(doc?.cables.flatMap((cable) => [cable.a.device, cable.b.device]) ?? []);
  return (
    <Dialog open={open} onClose={onClose} title="Project Progress" wide>
      <div className="space-y-4" data-testid="project-progress-overview">
        <div>
          <h3 className="text-[14px] font-semibold">{state.layoutName ?? 'Current project draft'}</h3>
          <p className="text-[12px] text-muted">Track the shape of your network designs and return to saved projects when you are ready.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ['Devices placed', doc?.devices.length ?? 0],
            ['Cable connections', doc?.cables.length ?? 0],
            ['Devices connected', linkedDevices.size],
            ['Saved projects', projects.length],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-line bg-pane-2/60 p-3"><p className="text-[11px] text-muted">{label}</p><p className="mt-1 text-[20px] font-semibold tabular-nums">{value}</p></div>)}
        </div>
        <section className="space-y-2" aria-label="Saved project progress">
          <h4 className="text-[12px] font-semibold">Saved project snapshots</h4>
          {projects.length ? <ul className="divide-y divide-line rounded-lg border border-line" data-testid="project-progress-list">
            {projects.map((item) => <li key={item.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">
              <span className="min-w-0 flex-1 font-medium">{item.name}</span>
              <span className="text-muted">{item.doc.devices.length} devices · {item.doc.cables.length} connections</span>
              <span className="text-faint">{relTime(item.savedAt)}</span>
            </li>)}
          </ul> : <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[12px] text-muted">No saved projects yet. Create a project and save a snapshot from My Projects as you make progress.</p>}
        </section>
      </div>
    </Dialog>
  );
}

function Designer({ lab, project }: { lab: MockLab | null; project?: string }) {
  const rt = useRuntime();
  const rf = useReactFlow();
  const s = useLab();
  const doc = s.doc!;
  const [palette, setPalette] = useState(true);
  const [layouts, setLayouts] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectProgressOpen, setProjectProgressOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectMessage, setProjectMessage] = useState('');
  const [structure, setStructure] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [newCable, setNewCable] = useState<{ a?: CableEnd } | null>(null);
  const [replace, setReplace] = useState<string | null>(null);
  const [vmFor, setVmFor] = useState<string | null>(null);
  const [simOpen, setSimOpenRaw] = useState(false);
  const [tools, setTools] = useState<ToolKey | null>(null);
  const [labsOpen, setLabsOpen] = useState(!project);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'guided' | 'scenario' | 'assessment'>('all');
  const [libraryView, setLibraryView] = useState<'type' | 'topic'>('topic');
  const [libraryTopic, setLibraryTopic] = useState<string | null>(null);
  const [libraryProgress, setLibraryProgress] = useState(false);
  const setSimOpen = (v: boolean) => {
    setSimOpenRaw(v);
    if (v) setTools(null);
  };
  const [hideSource, setHideSourceState] = useState(false);
  const setHideSource = (v: boolean) => {
    setHideSourceState(v);
    try {
      window.sessionStorage.setItem('aegis.lab.hideSourceBanner', v ? '1' : '0');
    } catch {}
  };
  // Narrow screens: start with the device library closed so the canvas has room; remember a dismissed banner for this session.
  useEffect(() => {
    if (window.innerWidth < 1280) setPalette(false);
    try {
      if (window.sessionStorage.getItem('aegis.lab.hideSourceBanner') === '1') setHideSourceState(true);
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
    const library = params.get('library');
    if (library === 'all' || library === 'guided' || library === 'scenario' || library === 'assessment') {
      setLibraryView(params.get('view') === 'topic' ? 'topic' : 'type');
      setLibraryTopic(params.get('topic') ?? (params.get('chapter') ? `ch${params.get('chapter')}` : null));
      setLibraryProgress(params.get('progress') === '1');
      window.history.replaceState(null, '', window.location.pathname);
      setLibraryFilter(library);
      setLabsOpen(true);
      return;
    }
    const arena = params.get('arena');
    if (arena) {
      setLabsOpen(false);
      window.history.replaceState(null, '', window.location.pathname);
      if (useLab.getState().doc?.workbook?.id !== ARENA_PREFIX + arena) startArena(arena);
      return;
    }
    const wb = params.get('workbook');
    if (wb) {
      setLabsOpen(false);
      window.history.replaceState(null, '', window.location.pathname);
      if (useLab.getState().doc?.workbook?.id !== wb) loadWorkbook(wb);
      setTools('labs');
      return;
    }
    const pack = params.get('pack');
    if (pack) {
      setLabsOpen(false);
      window.history.replaceState(null, '', window.location.pathname);
      const lab = loadPacks().find((p) => p.name === pack)?.labs?.[Number(params.get('lab') ?? 0)];
      const d = lab?.doc as LabDoc | undefined;
      if (d && d.version === 1 && Array.isArray(d.devices) && Array.isArray(d.cables)) useLab.getState().importDoc(d);
      return;
    }
    const id = params.get('challenge');
    if (!id) return;
    setLabsOpen(false);
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
          <h2 className="text-[13px] font-semibold">Project workspace</h2>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setLayouts(true)} data-testid="project-my-projects"><FolderOpen className="mr-1.5 size-4" />My Projects</Button>
        <Button size="sm" variant="primary" onClick={() => { setNewProjectName(''); setProjectMessage(''); setNewProjectOpen(true); }} data-testid="project-new"><Plus className="mr-1.5 size-4" />New Project</Button>
        <Button size="sm" variant="secondary" onClick={() => setProjectProgressOpen(true)} data-testid="project-progress"><ChartNoAxesCombined className="mr-1.5 size-4" />Project Progress</Button>
      </section>}
      {labsOpen && <LabPicker
        open
        inline
        initialFilter={libraryFilter}
        onClose={() => setLabsOpen(false)}
        initialView={libraryView}
        initialTopic={libraryTopic}
        initialProgress={libraryProgress}
        onStart={(id) => {
          setLabsOpen(false);
          loadWorkbook(id, () => rf.fitView({ padding: 0.15, duration: 250 }));
          setTools('labs');
          setSimOpenRaw(false);
        }}
        onChallenge={(id) => {
          setLabsOpen(false);
          const st = useLab.getState();
          if (st.doc?.workbook) st.endWorkbook();
          const cur = useLab.getState();
          if (cur.doc?.challenge) return setTools('challenge');
          const p = cur.doc ? prepareChallenge(cur.doc, id) : null;
          if (p) cur.startChallenge({ title: p.def.title, brief: p.brief, fault: p.fault }, p.apply);
          else cur.setError({ title: 'This ticket needs a design with a PC on a switch. Reset to the built-in lab and try again.', issues: [], tone: 'error' });
          if (p) setTimeout(() => rf.fitView({ padding: 0.15, duration: 250 }), 150);
          setTools('challenge');
        }}
        onArena={(id) => {
          setLabsOpen(false);
          if (startArena(id)) {
            setTools(null);
            setSimOpenRaw(false);
            if (s.tool === 'simulate') s.setTool('select');
          }
        }}
        onPlayground={() => {
          setLabsOpen(false);
          const st = useLab.getState();
          if (st.doc?.devices.length) st.saveLayout(`Before open playground · ${new Date().toLocaleString()}`.slice(0, 60));
          if (st.doc?.workbook) st.endWorkbook();
          if (useLab.getState().doc?.challenge) useLab.getState().endChallenge();
          updateArena((progress) => { progress.active = undefined; });
          useLab.getState().commit('Open playground', (doc) => {
            for (const key of Object.keys(doc) as (keyof LabDoc)[]) if (key !== 'version') delete (doc as Partial<LabDoc>)[key];
            Object.assign(doc, emptyDoc());
          });
          const blank = useLab.getState();
          blank.clearSelection();
          blank.setTool('select');
          blank.setCompare(false);
          blank.clearTraces();
          blank.closeInspector();
          blank.setError(null);
          useArenaUi.setState({ terms: [], activeTerm: null, termOpen: false, resultsOpen: false, submitted: null });
          setTools(null);
          setSimOpenRaw(false);
          setPalette(true);
          setTimeout(() => rf.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 250 }), 100);
        }}
      />}
      <Toolbar onLabs={project ? undefined : () => setLabsOpen(true)} paletteOpen={palette} setPaletteOpen={setPalette} onLayouts={() => setLayouts(true)} onStructure={() => setStructure(true)} onShortcuts={() => setShortcuts(true)} onNewCable={() => setNewCable({})} toolsOpen={!!tools} onTools={() => {
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
        {palette && (
          <aside className="w-[196px] shrink-0 border-r border-line bg-pane max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-20 max-xl:shadow-xl">
            <Palette />
          </aside>
        )}
        <main className={cx('relative min-w-0 flex-1', arenaId && 'max-xl:h-[min(56vh,560px)] max-xl:min-h-[360px] max-xl:flex-none')} aria-label="Canvas">
          <LabCanvas actions={actions} />
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
            if (hasWork) {
              const snapshotName = st.layoutName || `Autosaved project · ${new Date().toLocaleString()}`.slice(0, 60);
              if (!st.saveLayout(snapshotName)) {
                setProjectMessage('The current project could not be saved. Free browser storage before starting another project.');
                return;
              }
            }
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
        <ProjectProgressDialog open={projectProgressOpen} onClose={() => setProjectProgressOpen(false)} />
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
