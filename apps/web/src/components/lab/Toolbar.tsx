'use client';

import { useReactFlow } from '@xyflow/react';
import { AlignCenterVertical, Cable, Copy, FolderOpen, GitCompare, Grid3x3, Group, Image as ImageIcon, Keyboard, Layers, Maximize2, MousePointer2, PanelLeftClose, PanelLeftOpen, Plug, Radio, Redo2, RefreshCw, RotateCcw, Tag, Trash, Undo2, Ungroup, Wrench, StickyNote, Search, Scissors, FlaskConical } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useLab, type LabBackground } from '@/lab/store';
import { findDevices } from '@/lab/find';
import { prepareBackground } from '@/lab/bgimage';
import { cx, ConfirmDialog } from '@/components/ui';
import { CableTypeSelect, ContextMenu, type MenuItem } from './Pickers';

function TB({ label, onClick, active, disabled, children, testid, kbd, className }: { label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; active?: boolean; disabled?: boolean; children: ReactNode; testid?: string; kbd?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      data-testid={testid}
      className={cx('inline-flex h-8 items-center gap-1 rounded-[5px] px-2 text-[12.5px] disabled:opacity-40', active ? 'bg-action/15 text-action ring-1 ring-action/50' : 'text-muted hover:bg-pane-2 hover:text-text', className)}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

const BACKGROUNDS: Array<{ key: LabBackground; name: string; detail: string; image?: string }> = [
  { key: 'grid', name: 'Network grid', detail: 'Clean technical default' },
  { key: 'blueprint', name: 'Blueprint', detail: 'Engineering planning view', image: '/lab/backgrounds/blueprint-grid.png' },
  { key: 'datacenter', name: 'Data center', detail: 'Realistic server-room scene', image: '/lab/backgrounds/data-center.png' },
  { key: 'soc', name: 'SOC command', detail: 'Security operations atmosphere', image: '/lab/backgrounds/soc-command-center.png' },
  { key: 'global', name: 'Global network', detail: 'Cloud and WAN topology', image: '/lab/backgrounds/global-network.png' },
];

export function Toolbar({ onLabs, paletteOpen, setPaletteOpen, onLayouts, onStructure, onShortcuts, onNewCable, toolsOpen, onTools }: { onLabs: () => void; paletteOpen: boolean; setPaletteOpen: (v: boolean) => void; onLayouts: () => void; onStructure: () => void; onShortcuts: () => void; onNewCable: () => void; toolsOpen: boolean; onTools: () => void }) {
  const s = useLab();
  const rf = useReactFlow();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; title: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [backgroundError, setBackgroundError] = useState('');
  const backgroundInput = useRef<HTMLInputElement>(null);
  const n = s.selection.devices.length;
  const alignItems: MenuItem[] = [
    { label: 'Align left edges', onSelect: () => s.align('left') },
    { label: 'Align centres (vertical line)', onSelect: () => s.align('center') },
    { label: 'Align right edges', onSelect: () => s.align('right') },
    { label: 'Align tops', onSelect: () => s.align('top') },
    { label: 'Align middles (horizontal line)', onSelect: () => s.align('middle') },
    { label: 'Align bottoms', onSelect: () => s.align('bottom') },
    { separator: true, label: '', onSelect: () => {} },
    { label: 'Distribute horizontally', disabled: n < 3, onSelect: () => s.align('hspace') },
    { label: 'Distribute vertically', disabled: n < 3, onSelect: () => s.align('vspace') },
  ];
  return (
    <div role="toolbar" aria-label="Lab designer tools" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-pane px-2 py-1">
      <TB label={paletteOpen ? 'Hide device library' : 'Show device library'} onClick={() => setPaletteOpen(!paletteOpen)}>
        {paletteOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </TB>
      <button type="button" onClick={onLabs} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-action px-2.5 text-[12.5px] font-medium text-action-ink hover:brightness-110" data-testid="tool-labs" title="Pick a lab: VLANs, enterprise builds, SOC, routing…">
        <FlaskConical className="size-4" /> Labs
      </button>
      <Sep />
      <TB label="Select" kbd="V" active={s.tool === 'select'} onClick={() => s.setTool('select')} testid="tool-select">
        <MousePointer2 className="size-4" /> <span className="hidden lg:inline">Select</span>
      </TB>
      <TB label="Cable" kbd="C" active={s.tool === 'cable'} onClick={() => s.setTool(s.tool === 'cable' ? 'select' : 'cable')} testid="tool-cable">
        <Cable className="size-4" /> <span className="hidden lg:inline">Cable</span>
      </TB>
      {s.tool === 'cable' && <CableTypeSelect value={s.cableType} onChange={s.setCableType} id="toolbar-cable-type" />}
 <TB label="Disconnect cables" kbd="X" active={s.tool === 'disconnect'} onClick={() => s.setTool(s.tool === 'disconnect' ? 'select' : 'disconnect')} testid="tool-disconnect">
        <Scissors className="size-4" /> <span className="hidden lg:inline">Disconnect</span>
      </TB>
      <TB label="New cable form" className="max-sm:hidden" onClick={onNewCable} testid="tool-new-cable">
        <Plug className="size-4" />
      </TB>
      <TB label="Simulation" kbd="S" active={s.tool === 'simulate'} onClick={() => s.setTool(s.tool === 'simulate' ? 'select' : 'simulate')} testid="tool-simulate">
        <Radio className="size-4" /> <span className="hidden lg:inline">Simulate</span>
      </TB>
      <TB label="Audit, goals, troubleshooting, capture and export" active={toolsOpen} onClick={onTools} testid="tool-tools">
        <Wrench className="size-4" /> <span className="hidden lg:inline">Tools</span>
      </TB>
      <div className="relative">
        <TB label="Choose canvas background" active={backgroundOpen} onClick={() => setBackgroundOpen((v) => !v)} testid="tool-background">
          <ImageIcon className="size-4" /> <span className="hidden xl:inline">Background</span>
        </TB>
        {backgroundOpen && (
          <div className="absolute left-0 top-9 z-[1200] w-64 rounded-[7px] border border-line-strong bg-pane p-2 shadow-xl" role="menu" aria-label="Canvas backgrounds">
            <p className="px-1 pb-1 text-[11px] font-semibold text-muted">Canvas background</p>
            <div className="space-y-1">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s.background === b.key}
                  className={cx('flex w-full items-center gap-2 rounded-[5px] p-1 text-left hover:bg-pane-2', s.background === b.key && 'bg-action/15 ring-1 ring-action/50')}
                  onClick={() => {
                    s.setBackground(b.key);
                    setBackgroundOpen(false);
                  }}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded border border-line bg-ink" style={b.image ? { backgroundImage: `url(${b.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} aria-hidden>
                    {!b.image && <span className="block size-full opacity-70" style={{ backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '7px 7px' }} />}
                  </span>
                  <span className="min-w-0"><span className="block text-[12px] font-medium">{b.name}</span><span className="block truncate text-[10px] text-muted">{b.detail}</span></span>
                  {s.background === b.key && <span className="ml-auto text-[10px] text-action">Selected</span>}
                </button>
              ))}
              {s.customBackground && (
                <button type="button" role="menuitemradio" aria-checked={s.background === 'custom'} className={cx('flex w-full items-center gap-2 rounded-[5px] p-1 text-left hover:bg-pane-2', s.background === 'custom' && 'bg-action/15 ring-1 ring-action/50')} onClick={() => { s.setBackground('custom'); setBackgroundOpen(false); }}>
                  <span className="size-10 shrink-0 rounded border border-line bg-cover bg-center" style={{ backgroundImage: `url(${s.customBackground})` }} aria-hidden />
                  <span className="min-w-0"><span className="block text-[12px] font-medium">My image</span><span className="block truncate text-[10px] text-muted">From this computer</span></span>
                  {s.background === 'custom' && <span className="ml-auto text-[10px] text-action">Selected</span>}
                </button>
              )}
            </div>
            <input
              ref={backgroundInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                void prepareBackground(file).then((r) => {
                  if (!r.ok) return setBackgroundError(r.error);
                  const saved = s.setCustomBackground(r.dataUrl);
                  setBackgroundError(saved ? '' : 'Shown now, but too large to keep after a reload. Try a smaller image.');
                  if (saved) setBackgroundOpen(false);
                });
              }}
            />
            <button type="button" className="mt-2 flex w-full items-center justify-center rounded border border-dashed border-line-strong px-2 py-1.5 text-[11px] text-muted hover:border-action hover:text-text" onClick={() => backgroundInput.current?.click()}>
              Choose image from this computer
            </button>
            {s.customBackground && (
              <button type="button" className="mt-1 w-full rounded px-2 py-1 text-[10px] text-muted hover:bg-pane-2 hover:text-text" onClick={() => { s.setCustomBackground(null); setBackgroundError(''); }}>
                Remove custom image
              </button>
            )}
            {backgroundError && <p className="mt-1 px-1 text-[10px] text-down" role="alert">{backgroundError}</p>}
            <p className="mt-2 px-1 text-[10px] text-faint">Saved for this lab on this browser. A dark overlay keeps ports and cables readable.</p>
          </div>
        )}
      </div>
      <TB
        label="Add a note"
        testid="tool-note"
        onClick={() => {
          const vp = rf.getViewport();
          const el = document.querySelector('[aria-label="Canvas"]')?.getBoundingClientRect();
          const cx0 = el ? (el.width / 2 - vp.x) / vp.zoom : 0;
          const cy0 = el ? (el.height / 2 - vp.y) / vp.zoom : 0;
          s.addAnnotation({ kind: 'text', x: Math.round(cx0 - 100), y: Math.round(cy0 - 40), w: 200, h: 80, text: 'Note', color: 'amber' });
        }}
      >
        <StickyNote className="size-4" />
      </TB>
      <Sep />
      <TB label="Undo" kbd="Ctrl+Z" disabled={!s.past.length} onClick={() => s.undo()} testid="undo">
        <Undo2 className="size-4" />
      </TB>
      <TB label="Redo" kbd="Ctrl+Shift+Z" disabled={!s.future.length} onClick={() => s.redo()} testid="redo">
        <Redo2 className="size-4" />
      </TB>
      <TB label="Duplicate" className="max-sm:hidden" kbd="Ctrl+D" disabled={!n} onClick={() => s.duplicate()}>
        <Copy className="size-4" />
      </TB>
      <TB label="Delete" kbd="Del" disabled={!n && !s.selection.cables.length} onClick={() => s.deleteSelection()}>
        <Trash className="size-4" />
      </TB>
      <TB
        label="Align and distribute" className="max-sm:hidden"
        disabled={n < 2}
        testid="tool-align"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4, items: alignItems, title: 'Align' });
        }}
      >
        <AlignCenterVertical className="size-4" />
      </TB>
      <TB label="Group" className="max-sm:hidden" kbd="Ctrl+G" disabled={n < 2} onClick={() => s.group()}>
        <Group className="size-4" />
      </TB>
      <TB label="Ungroup" className="max-sm:hidden" kbd="Ctrl+Shift+G" disabled={!n} onClick={() => s.ungroup()}>
        <Ungroup className="size-4" />
      </TB>
      <Sep />
      <TB label="Snap to grid" className="max-sm:hidden" active={s.snap} onClick={() => s.setSnap(!s.snap)}>
        <Grid3x3 className="size-4" />
      </TB>
      <TB label="Port labels" kbd="L" active={s.portLabels} onClick={() => s.setView({ portLabels: !s.portLabels })}>
        <Tag className="size-4" />
      </TB>
      <TB label={s.labelMode === 'full' ? 'Compact device labels' : 'Full device labels'} active={s.labelMode === 'full'} onClick={() => s.setView({ labelMode: s.labelMode === 'full' ? 'compact' : 'full' })}>
        <Layers className="size-4" />
      </TB>
      <TB label="Fit to screen" className="max-sm:hidden" kbd="F" onClick={() => rf.fitView({ padding: 0.1 })}>
        <Maximize2 className="size-4" />
      </TB>
      <Sep />
      <TB label="Compare with baseline" active={s.compare} onClick={() => s.setCompare(!s.compare)} testid="tool-compare">
        <GitCompare className="size-4" /> <span className="hidden xl:inline">Compare</span>
      </TB>
      <TB label="Sites, racks, VLANs, subnets, WAN and cloud" onClick={onStructure} testid="tool-structure">
        <span className="text-[12px]">Structure</span>
      </TB>
      <TB label="Saved layouts" onClick={onLayouts} testid="tool-layouts">
        <FolderOpen className="size-4" /> <span className="hidden xl:inline">{s.layoutName ?? 'Layouts'}</span>
      </TB>
      <TB label="Refresh devices from the lab" onClick={() => s.refreshFromLab()} testid="tool-refresh">
        <RefreshCw className="size-4" />
      </TB>
      <TB label="Reset to baseline" onClick={() => setConfirmReset(true)} testid="tool-reset">
        <RotateCcw className="size-4" />
      </TB>
      <span className="flex-1" />
      <DeviceFinder />
      <TB label="Keyboard shortcuts" className="max-sm:hidden" kbd="?" onClick={onShortcuts}>
        <Keyboard className="size-4" />
      </TB>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset the canvas to the baseline?"
        body={<p>This replaces the current design with the baseline lab (positions, devices, cables and settings). It does not touch the real lab. You can undo it with Ctrl+Z.</p>}
        confirmLabel="Reset to baseline"
        onConfirm={() => {
          s.resetToBaseline();
          setConfirmReset(false);
          setTimeout(() => rf.fitView({ padding: 0.08 }), 50);
        }}
      />
    </div>
  );
}

/** Find devices by name, IP, MAC, VLAN ("vlan 20") or port ("Gi0/14", "SW1 Gi0/1") and jump to them. */
function DeviceFinder() {
  const rf = useReactFlow();
  const doc = useLab((s) => s.doc);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const go = () => {
    if (!doc) return;
    const ids = findDevices(doc, q);
    if (!ids.length) return setMsg('Not found');
    setMsg(ids.length > 1 ? `${ids.length} devices` : '');
    useLab.getState().select({ devices: ids, cables: [] });
    if (ids.length === 1) {
      const d = doc.devices.find((x) => x.id === ids[0])!;
      rf.setCenter(d.x + 64, d.y + 52, { zoom: Math.max(rf.getZoom(), 1.1), duration: 400 });
    } else rf.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.3, duration: 400 });
  };
  return (
    <form
      className="relative mr-1 flex items-center"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <Search className="pointer-events-none absolute left-2 size-3.5 text-faint" aria-hidden />
      <input
        list="lab-device-names"
        value={q}
        onChange={(e) => (setQ(e.target.value), setMsg(''))}
        placeholder="Find: name, IP, MAC, vlan 20, Gi0/1"
        aria-label="Find devices by name, IP, MAC, VLAN or port"
        data-testid="device-finder"
        className="h-8 w-56 rounded-[5px] border border-line-strong bg-ink pr-2 pl-7 text-[12.5px] focus:border-action max-sm:w-40"
      />
      <datalist id="lab-device-names">
        {doc?.devices.map((d) => (
          <option key={d.id} value={d.name} />
        ))}
      </datalist>
      {msg && <span className="absolute top-full right-0 mt-0.5 rounded bg-down px-1 text-[10.5px] text-white">{msg}</span>}
    </form>
  );
}
