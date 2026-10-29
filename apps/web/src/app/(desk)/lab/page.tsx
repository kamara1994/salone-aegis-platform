'use client';

import { loadPacks } from '@/content/progress';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTopology } from '@/api/hooks';
import type { Topology } from '@/api/types';
import { useRuntime } from '@/components/providers';
import { CableInspector, DeviceInspector, VmDialog } from '@/components/lab/Inspector';
import { LabCanvas, LabFlowProvider, type CanvasActions } from '@/components/lab/LabCanvas';
import { DiffPanel, LayoutsDialog, ReplaceCableDialog, ShortcutsDialog, StructureDialog } from '@/components/lab/LabDialogs';
import { Palette } from '@/components/lab/Palette';
import { NewCableDialog } from '@/components/lab/Pickers';
import { SimPanel } from '@/components/lab/SimPanel';
import { Toolbar } from '@/components/lab/Toolbar';
import { ToolsPanel, type ToolKey } from '@/components/lab/ToolsPanel';
import { startWorkbookById } from '@/components/lab/WorkbooksTab';
import { Button, cx, ErrorState, IconButton, Loading, relTime } from '@/components/ui';
import { prepareChallenge } from '@/lab/challenges';
import { buildDoc } from '@/lab/inventory';
import { setFresh, useLab } from '@/lab/store';
import type { CableEnd, LabDoc } from '@/lab/types';
import { deviceById } from '@/lab/validate';
import { initialLab, type LabState as MockLab } from '@/mock/lab';

const BASELINE_KEY = 'aegis.lab.baseline.v1:live-topology';

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

export default function LabPage() {
  const rt = useRuntime();
  const topo = useTopology('all');
  const ready = useLab((s) => !!s.doc);
  const inited = useRef(false);
  const [lab, setLab] = useState<MockLab | null>(null);

  useEffect(() => {
    if (!topo.data) return;
    const snapshot = rt.mock ? rt.mock.labSnapshot() : null;
    setLab(snapshot);
    const fresh = buildDoc(topo.data as Topology, snapshot);
    if (!inited.current) {
      inited.current = true;
      const baseline = rt.mock ? buildDoc(topo.data as Topology, initialLab()) : liveBaseline(fresh);
      useLab.getState().init(fresh.source, fresh, baseline);
    } else setFresh(fresh);
  }, [topo.data, rt.mock]);

  if (topo.error) return <ErrorState error={topo.error} retry={() => topo.refetch()} />;
  if (!ready) return <Loading rows={8} />;
  return (
    <LabFlowProvider>
      <Designer lab={lab} />
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

function Designer({ lab }: { lab: MockLab | null }) {
  const rt = useRuntime();
  const s = useLab();
  const doc = s.doc!;
  const [palette, setPalette] = useState(true);
  const [layouts, setLayouts] = useState(false);
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
  const [hideSource, setHideSource] = useState(false);
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
    const params = new URLSearchParams(window.location.search);
    const wb = params.get('workbook');
    if (wb) {
      window.history.replaceState(null, '', window.location.pathname);
      if (useLab.getState().doc?.workbook?.id !== wb) startWorkbookById(wb);
      setTools('labs');
      return;
    }
    const pack = params.get('pack');
    if (pack) {
      window.history.replaceState(null, '', window.location.pathname);
      const lab = loadPacks().find((p) => p.name === pack)?.labs?.[Number(params.get('lab') ?? 0)];
      const d = lab?.doc as LabDoc | undefined;
      if (d && d.version === 1 && Array.isArray(d.devices) && Array.isArray(d.cables)) useLab.getState().importDoc(d);
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

  const selDevice = s.selection.devices.length === 1 ? deviceById(doc, s.selection.devices[0]) : undefined;
  const selCable = s.selection.cables.length === 1 ? doc.cables.find((c) => c.id === s.selection.cables[0]) : undefined;
  const showInspector = s.inspectorOpen && (selDevice || selCable);
  const vmDevice = vmFor ? deviceById(doc, vmFor) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="lab-designer">
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
      <div className="relative flex min-h-0 flex-1">
        {palette && (
          <aside className="w-[196px] shrink-0 border-r border-line bg-pane max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:shadow-xl">
            <Palette />
          </aside>
        )}
        <main className="relative min-w-0 flex-1" aria-label="Canvas">
          <LabCanvas actions={actions} />
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
      <LayoutsDialog open={layouts} onClose={() => setLayouts(false)} />
      <StructureDialog open={structure} onClose={() => setStructure(false)} />
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      <NewCableDialog open={!!newCable} onClose={() => setNewCable(null)} initial={newCable ?? undefined} />
      <ReplaceCableDialog cableId={replace} onClose={() => setReplace(null)} />
      {vmDevice && <VmDialog device={vmDevice} open={!!vmDevice} onClose={() => setVmFor(null)} />}
      {!rt.mock && <span className="sr-only">Live mode</span>}
    </div>
  );
}
