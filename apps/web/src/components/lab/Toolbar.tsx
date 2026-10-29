'use client';

import { useReactFlow } from '@xyflow/react';
import { AlignCenterVertical, Cable, Copy, FolderOpen, GitCompare, Grid3x3, Group, Keyboard, Layers, Maximize2, MousePointer2, PanelLeftClose, PanelLeftOpen, Plug, Radio, Redo2, RefreshCw, RotateCcw, Tag, Trash, Undo2, Ungroup, Wrench, StickyNote, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLab } from '@/lab/store';
import { cx, ConfirmDialog } from '@/components/ui';
import { CableTypeSelect, ContextMenu, type MenuItem } from './Pickers';

function TB({ label, onClick, active, disabled, children, testid, kbd }: { label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; active?: boolean; disabled?: boolean; children: ReactNode; testid?: string; kbd?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      data-testid={testid}
      className={cx('inline-flex h-8 items-center gap-1 rounded-[5px] px-2 text-[12.5px] disabled:opacity-40', active ? 'bg-action/15 text-action ring-1 ring-action/50' : 'text-muted hover:bg-pane-2 hover:text-text')}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

export function Toolbar({ paletteOpen, setPaletteOpen, onLayouts, onStructure, onShortcuts, onNewCable, toolsOpen, onTools }: { paletteOpen: boolean; setPaletteOpen: (v: boolean) => void; onLayouts: () => void; onStructure: () => void; onShortcuts: () => void; onNewCable: () => void; toolsOpen: boolean; onTools: () => void }) {
  const s = useLab();
  const rf = useReactFlow();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; title: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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
      <Sep />
      <TB label="Select" kbd="V" active={s.tool === 'select'} onClick={() => s.setTool('select')} testid="tool-select">
        <MousePointer2 className="size-4" /> <span className="hidden lg:inline">Select</span>
      </TB>
      <TB label="Cable" kbd="C" active={s.tool === 'cable'} onClick={() => s.setTool(s.tool === 'cable' ? 'select' : 'cable')} testid="tool-cable">
        <Cable className="size-4" /> <span className="hidden lg:inline">Cable</span>
      </TB>
      {s.tool === 'cable' && <CableTypeSelect value={s.cableType} onChange={s.setCableType} id="toolbar-cable-type" />}
      <TB label="New cable form" onClick={onNewCable} testid="tool-new-cable">
        <Plug className="size-4" />
      </TB>
      <TB label="Simulation" kbd="S" active={s.tool === 'simulate'} onClick={() => s.setTool(s.tool === 'simulate' ? 'select' : 'simulate')} testid="tool-simulate">
        <Radio className="size-4" /> <span className="hidden lg:inline">Simulate</span>
      </TB>
      <TB label="Audit, goals, troubleshooting, capture and export" active={toolsOpen} onClick={onTools} testid="tool-tools">
        <Wrench className="size-4" /> <span className="hidden lg:inline">Tools</span>
      </TB>
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
      <TB label="Duplicate" kbd="Ctrl+D" disabled={!n} onClick={() => s.duplicate()}>
        <Copy className="size-4" />
      </TB>
      <TB label="Delete" kbd="Del" disabled={!n && !s.selection.cables.length} onClick={() => s.deleteSelection()}>
        <Trash className="size-4" />
      </TB>
      <TB
        label="Align and distribute"
        disabled={n < 2}
        testid="tool-align"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4, items: alignItems, title: 'Align' });
        }}
      >
        <AlignCenterVertical className="size-4" />
      </TB>
      <TB label="Group" kbd="Ctrl+G" disabled={n < 2} onClick={() => s.group()}>
        <Group className="size-4" />
      </TB>
      <TB label="Ungroup" kbd="Ctrl+Shift+G" disabled={!n} onClick={() => s.ungroup()}>
        <Ungroup className="size-4" />
      </TB>
      <Sep />
      <TB label="Snap to grid" active={s.snap} onClick={() => s.setSnap(!s.snap)}>
        <Grid3x3 className="size-4" />
      </TB>
      <TB label="Port labels" kbd="L" active={s.portLabels} onClick={() => s.setView({ portLabels: !s.portLabels })}>
        <Tag className="size-4" />
      </TB>
      <TB label={s.labelMode === 'full' ? 'Compact device labels' : 'Full device labels'} active={s.labelMode === 'full'} onClick={() => s.setView({ labelMode: s.labelMode === 'full' ? 'compact' : 'full' })}>
        <Layers className="size-4" />
      </TB>
      <TB label="Fit to screen" kbd="F" onClick={() => rf.fitView({ padding: 0.1 })}>
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
      <TB label="Keyboard shortcuts" kbd="?" onClick={onShortcuts}>
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

/** Find a device by name, IP or MAC and jump to it. */
function DeviceFinder() {
  const rf = useReactFlow();
  const doc = useLab((s) => s.doc);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const go = () => {
    const needle = q.trim().toLowerCase();
    if (!needle || !doc) return;
    const d =
      doc.devices.find((x) => x.name.toLowerCase() === needle) ??
      doc.devices.find((x) => x.interfaces.some((i) => i.ip === needle || i.mac.toLowerCase() === needle)) ??
      doc.devices.find((x) => x.name.toLowerCase().includes(needle));
    if (!d) return setMsg('Not found');
    setMsg('');
    useLab.getState().select({ devices: [d.id], cables: [] });
    rf.setCenter(d.x + 64, d.y + 52, { zoom: Math.max(rf.getZoom(), 1.1), duration: 400 });
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
        placeholder="Find device, IP, MAC"
        aria-label="Find a device by name, IP or MAC"
        data-testid="device-finder"
        className="h-8 w-40 rounded-[5px] border border-line-strong bg-ink pr-2 pl-7 text-[12.5px] focus:border-action max-2xl:w-32"
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
