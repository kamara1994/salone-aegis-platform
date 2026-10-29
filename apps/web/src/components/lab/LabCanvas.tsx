'use client';

import { applyNodeChanges, Background, BackgroundVariant, ConnectionMode, ControlButton, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, ViewportPortal, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { Map as MapIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_MODEL, KIND_LABEL } from '@/lab/catalog';
import { diffDocs } from '@/lab/diff';
import { DEVICE_H, DEVICE_W } from '@/lab/inventory';
import { GRID, useLab } from '@/lab/store';
import type { CableEnd, CableType, Device, LabDoc } from '@/lab/types';
import { cableOnPort, cableStatus, deviceById, otherEnd, suggestCableType } from '@/lab/validate';
import { useLive, useUi } from '@/state/ui';
import { CableEdge, DeviceNode, GroupFrame, NoteNode, SiteFrame, type CableEdgeData, type CompareMark, type DeviceNodeData, type NoteNodeData } from './CanvasParts';
import { controlPlane } from '@/lab/protocols';
import { PacketLayer } from './PacketLayer';
import { ContextMenu, ErrorBanner, linkTestSummary, PortPicker, type MenuItem } from './Pickers';

const nodeTypes = { device: DeviceNode, site: SiteFrame, group: GroupFrame, note: NoteNode };
const edgeTypes = { cable: CableEdge };
const BACKGROUND_IMAGE: Record<string, string> = {
  blueprint: '/lab/backgrounds/blueprint-grid.png',
  datacenter: '/lab/backgrounds/data-center.png',
  soc: '/lab/backgrounds/soc-command-center.png',
  global: '/lab/backgrounds/global-network.png',
};

type Picker = { deviceId: string; stage: 'first' | 'second' | 'reconnect'; from?: CableEnd; thenDevice?: string; cableId?: string; end?: 'a' | 'b' };
type Menu = { x: number; y: number; title?: string; items: MenuItem[] };

export interface CanvasActions {
  openTerminal(deviceId: string): void;
  openVm(deviceId: string): void;
  pingFrom(deviceId: string): void;
  replaceCable(cableId: string): void;
  newCable(a?: CableEnd): void;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.closest('dialog[open]') || !!el.closest('.xterm');
}

function bounds(devs: Device[]) {
  const xs = devs.map((d) => d.x);
  const ys = devs.map((d) => d.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + DEVICE_W, h: Math.max(...ys) - Math.min(...ys) + DEVICE_H };
}

function Inner({ actions }: { actions: CanvasActions }) {
  const s = useLab();
  const doc = s.doc as LabDoc;
  const flows = useLive((x) => x.flows);
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const disconnectRef = useRef<((id: string) => void) | null>(null);
  // Mini map: off on small screens by default, remembered per browser.
  const [miniMap, setMiniMapState] = useState(true);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('aegis.lab.minimap');
      setMiniMapState(v === null ? window.innerWidth >= 900 : v === '1');
    } catch {
      setMiniMapState(window.innerWidth >= 900);
    }
  }, []);
  const setMiniMap = (v: boolean) => {
    setMiniMapState(v);
    try {
      window.localStorage.setItem('aegis.lab.minimap', v ? '1' : '0');
    } catch {}
  };
  const [bendDraft, setBendDraft] = useState<{ id: string; x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const dragStart = useRef<Record<string, { x: number; y: number }>>({});

  const statuses = useMemo(() => Object.fromEntries(doc.cables.map((c) => [c.id, cableStatus(doc, c)])), [doc]);
  const cp = useMemo(() => controlPlane(doc), [doc]);
  const [noteSel, setNoteSel] = useState<string | null>(null);
  const noteSelRef = useRef<string | null>(null);
  noteSelRef.current = noteSel;
  const stpPortBlocked = useCallback((dev: string, port: string) => cp.stp[dev]?.enabled && cp.stp[dev]?.ports[port]?.state === 'blocking', [cp]);
  const channelOf = useCallback(
    (dev: string, port: string) => {
      const ch = cp.channels.find((x) => x.device === dev && x.members.includes(port));
      return ch ? { group: ch.group, ok: ch.ok } : undefined;
    },
    [cp],
  );
  const diff = useMemo(() => (s.compare && s.baseline ? diffDocs(s.baseline, doc) : []), [s.compare, s.baseline, doc]);
  const trace = s.traces.find((t) => t.id === s.activeTrace);
  const onPathDev = useMemo(() => new Set(trace?.path ?? []), [trace]);
  const onPathCable = useMemo(() => new Set(trace?.cables ?? []), [trace]);

  const devMark = useMemo(() => {
    const m: Record<string, CompareMark> = {};
    for (const d of diff) if (d.deviceId && d.subject !== 'route') m[d.deviceId] = d.kind === 'added' && d.subject === 'device' ? 'added' : d.kind === 'removed' && d.subject === 'device' ? 'removed' : (m[d.deviceId] ?? 'changed');
    return m;
  }, [diff]);
  const cableMark = useMemo(() => {
    const m: Record<string, CompareMark> = {};
    for (const d of diff) if (d.cableId) m[d.cableId] = d.kind;
    return m;
  }, [diff]);

  const built = useMemo(() => {
    const list: Node[] = [];
    for (const site of doc.sites) {
      const members = doc.devices.filter((d) => d.siteId === site.id);
      if (!members.length) continue;
      const b = bounds(members);
      list.push({ id: `site:${site.id}`, type: 'site', position: { x: b.x - 28, y: b.y - 48 }, data: { label: site.name, sub: site.cidr }, style: { width: b.w + 56, height: b.h + 76 }, draggable: false, selectable: false, focusable: false, zIndex: -2 });
    }
    for (const g of doc.groups) {
      const members = doc.devices.filter((d) => d.groupId === g.id);
      if (!members.length) continue;
      const b = bounds(members);
      list.push({ id: `group:${g.id}`, type: 'group', position: { x: b.x - 14, y: b.y - 30 }, data: { label: g.name, members: members.map((m) => m.id) }, style: { width: b.w + 28, height: b.h + 44 }, selectable: false, focusable: false, zIndex: -1 });
    }
    const linkCount = (id: string) => {
      const cs = doc.cables.filter((c) => c.a.device === id || c.b.device === id);
      return { total: cs.length, up: cs.filter((c) => statuses[c.id]?.state === 'up').length };
    };
    for (const d of doc.devices) {
      const lc = linkCount(d.id);
      list.push({
        id: d.id,
        type: 'device',
        position: { x: d.x, y: d.y },
        selected: s.selection.devices.includes(d.id),
        data: { device: d, linksUp: lc.up, linksTotal: lc.total, compare: devMark[d.id], labels: s.labelMode, connectable: s.tool === 'cable', pending: s.pendingEnd?.device === d.id, onPath: onPathDev.has(d.id), stpRoot: !!cp.stp[d.id]?.isRoot && cp.stp[d.id].enabled && Object.values(cp.stp[d.id].ports).some((p) => p.role === 'designated') && Object.keys(cp.stp).length > 1 } satisfies DeviceNodeData,
        ariaLabel: `${d.name}, ${KIND_LABEL[d.kind]}`,
      });
    }
    for (const n of doc.annotations ?? [])
      list.push({ id: `note:${n.id}`, type: 'note', position: { x: n.x, y: n.y }, selected: noteSel === n.id, data: { note: n } satisfies NoteNodeData, style: { width: n.w, height: n.h }, zIndex: n.kind === 'text' ? 5 : -1, ariaLabel: `Note: ${n.text}` });
    if (s.compare && s.baseline) {
      for (const d of s.baseline.devices) {
        if (deviceById(doc, d.id)) continue;
        list.push({ id: `ghost:${d.id}`, type: 'device', position: { x: d.x, y: d.y }, draggable: false, selectable: false, data: { device: d, linksUp: 0, linksTotal: 0, compare: 'removed', labels: s.labelMode, connectable: false, pending: false, onPath: false, ghost: true } satisfies DeviceNodeData });
      }
    }
    return list;
  }, [doc, statuses, s.selection.devices, s.labelMode, s.tool, s.pendingEnd, devMark, onPathDev, s.compare, s.baseline, cp, noteSel]);

  // Keep measured sizes when nodes are rebuilt, otherwise React Flow hides each node until it re-measures
  // it, which makes nodes flicker and swallows the second click of a double-click.
  useEffect(
    () =>
      setNodes((prev) => {
        const old = new Map(prev.map((n) => [n.id, n]));
        return built.map((n) => {
          const p = old.get(n.id);
          return p?.measured ? { ...n, measured: p.measured, width: p.width, height: p.height } : n;
        });
      }),
    [built],
  );

  const onEndPointerDown = useCallback(
    (cableId: string, end: 'a' | 'b', e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const c = doc.cables.find((x) => x.id === cableId);
      if (!c) return;
      const fixed = rf.getInternalNode(end === 'a' ? c.b.device : c.a.device);
      const from = { x: (fixed?.internals.positionAbsolute.x ?? 0) + DEVICE_W / 2, y: (fixed?.internals.positionAbsolute.y ?? 0) + DEVICE_H / 2 };
      const move = (ev: PointerEvent) => setGhost({ from, to: rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }) });
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setGhost(null);
        const el = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => (x as HTMLElement).closest?.('[data-device-id]')).find(Boolean) as HTMLElement | undefined;
        const target = el?.dataset.deviceId;
        if (target) setPicker({ deviceId: target, stage: 'reconnect', cableId, end, from: end === 'a' ? c.b : c.a });
        else if ((document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('.react-flow__pane')) disconnectRef.current?.(cableId); // dropped on empty canvas: unplug
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [doc, rf],
  );

  const onBendPointerDown = useCallback(
    (cableId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      let last: { x: number; y: number } | null = null;
      const move = (ev: PointerEvent) => {
        last = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        setBendDraft({ id: cableId, ...last });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setBendDraft(null);
        if (last) useLab.getState().updateCable(cableId, { bend: { x: Math.round(last.x), y: Math.round(last.y) } });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [rf],
  );

  const edges: Edge[] = useMemo(() => {
    // Stagger port labels where many cables leave one device, so neighbouring labels don't overlap.
    const pos = new Map(doc.devices.map((d) => [d.id, d]));
    const stagger = new Map<string, number>();
    const byDev = new Map<string, { key: string; angle: number }[]>();
    for (const c of doc.cables)
      for (const [me, other, end] of [[c.a.device, c.b.device, 'a'], [c.b.device, c.a.device, 'b']] as const) {
        const p = pos.get(me);
        const q = pos.get(other);
        if (!p || !q) continue;
        const list = byDev.get(me) ?? [];
        list.push({ key: `${c.id}:${end}`, angle: Math.atan2(q.y - p.y, q.x - p.x) });
        byDev.set(me, list);
      }
    for (const list of byDev.values()) {
      if (list.length < 4) continue;
      list.sort((x, y) => x.angle - y.angle).forEach((e, k) => stagger.set(e.key, (k % 3) * 18));
    }
    const list: Edge[] = doc.cables.map((c) => ({
      id: c.id,
      source: c.a.device,
      target: c.b.device,
      type: 'cable',
      selected: s.selection.cables.includes(c.id),
      ariaLabel: `Cable ${deviceById(doc, c.a.device)?.name} ${c.a.port} to ${deviceById(doc, c.b.device)?.name} ${c.b.port}`,
      data: {
        cable: bendDraft?.id === c.id ? { ...c, bend: { x: bendDraft.x, y: bendDraft.y } } : c,
        status: statuses[c.id],
        portLabels: s.portLabels,
        labelOffset: { a: stagger.get(`${c.id}:a`) ?? 0, b: stagger.get(`${c.id}:b`) ?? 0 },
        flow: c.linkId ? flows[c.linkId] : undefined,
        compare: cableMark[c.id],
        onPath: onPathCable.has(c.id),
        blocked: [stpPortBlocked(c.a.device, c.a.port) ? ('a' as const) : null, stpPortBlocked(c.b.device, c.b.port) ? ('b' as const) : null].filter((x): x is 'a' | 'b' => !!x),
        channel: channelOf(c.a.device, c.a.port),
        onEndPointerDown,
        onBendPointerDown,
        onBendReset: (id: string) => useLab.getState().updateCable(id, { bend: undefined }),
      } satisfies CableEdgeData,
    }));
    if (s.compare && s.baseline) {
      for (const d of diff.filter((x) => x.kind === 'removed' && x.subject === 'cable')) {
        const c = s.baseline.cables.find((x) => x.id === d.cableId);
        if (!c) continue;
        const src = deviceById(doc, c.a.device) ? c.a.device : `ghost:${c.a.device}`;
        const dst = deviceById(doc, c.b.device) ? c.b.device : `ghost:${c.b.device}`;
        list.push({ id: `ghost:${c.id}`, source: src, target: dst, type: 'cable', selectable: false, data: { cable: c, status: { state: 'disabled', issues: [] }, portLabels: false, compare: 'removed', ghost: true, onPath: false } satisfies CableEdgeData });
      }
    }
    return list;
  }, [doc, statuses, s.selection.cables, s.portLabels, flows, cableMark, onPathCable, s.compare, s.baseline, diff, bendDraft, onEndPointerDown, onBendPointerDown, stpPortBlocked, channelOf]);

  // Selection lives in the lab store only. React Flow's select changes are translated into it,
  // so the canvas and the store can never disagree (and never ping-pong).
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const sel = changes.filter((c): c is NodeChange & { type: 'select'; id: string; selected: boolean } => c.type === 'select');
    const rest = changes.filter((c) => c.type !== 'select');
    if (rest.length) setNodes((ns) => applyNodeChanges(rest, ns));
    if (!sel.length) return;
    for (const c of sel) if (c.id.startsWith('note:')) setNoteSel((cur) => (c.selected ? c.id.slice(5) : cur === c.id.slice(5) ? null : cur));
    const st = useLab.getState();
    if (st.tool !== 'select') return; // cable and simulation clicks pick devices, they do not select them
    const devices = new Set(st.selection.devices);
    for (const c of sel) {
      if (c.id.startsWith('ghost:') || c.id.startsWith('site:') || c.id.startsWith('group:') || c.id.startsWith('note:')) continue;
      if (c.selected) devices.add(c.id);
      else devices.delete(c.id);
    }
    st.select({ devices: [...devices], cables: useLab.getState().selection.cables });
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const sel = changes.filter((c): c is EdgeChange & { type: 'select'; id: string; selected: boolean } => c.type === 'select');
    if (!sel.length) return;
    const st = useLab.getState();
    if (st.tool !== 'select') return;
    const cables = new Set(st.selection.cables);
    for (const c of sel) {
      if (c.id.startsWith('ghost:')) continue;
      if (c.selected) cables.add(c.id);
      else cables.delete(c.id);
    }
    st.select({ devices: useLab.getState().selection.devices, cables: [...cables] });
  }, []);

  // ---- cabling ----
  const startCable = useCallback((deviceId: string, thenDevice?: string) => setPicker({ deviceId, stage: 'first', thenDevice }), []);

  const finishCable = (from: CableEnd, to: CableEnd) => {
    const st = useLab.getState();
    const type = st.cableType === 'auto' ? suggestCableType(st.doc!, from, to) : st.cableType;
    const r = st.connect(from, to, type);
    st.setPendingEnd(null);
    if (!r.ok) st.setError({ title: 'This cable cannot be connected', issues: r.issues });
    else {
      const problems = r.issues.filter((i) => i.severity === 'down' || i.severity === 'degraded');
      st.setError(problems.length ? { title: 'Connected, but the link has problems', issues: problems, tone: 'warn' } : null);
    }
  };

  const onPick = (port: string) => {
    if (!picker) return;
    const st = useLab.getState();
    const end: CableEnd = { device: picker.deviceId, port };
    if (picker.stage === 'first') {
      const used = cableOnPort(st.doc!, end.device, end.port);
      if (used) {
        setPicker(null);
        const peer = otherEnd(used, end.device, end.port);
        st.setError({ title: 'That port is already in use', issues: [{ code: 'occupied', severity: 'error', message: `${deviceById(st.doc!, end.device)?.name} ${end.port} is already connected to ${deviceById(st.doc!, peer.device)?.name} ${peer.port}.`, fix: 'Pick a free port, or remove the existing cable first.' }] });
        return;
      }
      st.setPendingEnd(end);
      if (picker.thenDevice) setPicker({ deviceId: picker.thenDevice, stage: 'second', from: end });
      else setPicker(null);
      return;
    }
    if (picker.stage === 'second' && picker.from) {
      setPicker(null);
      finishCable(picker.from, end);
      return;
    }
    if (picker.stage === 'reconnect' && picker.cableId && picker.end) {
      setPicker(null);
      const r = st.reconnectCable(picker.cableId, picker.end, end);
      if (!r.ok) st.setError({ title: 'The cable cannot be moved there', issues: r.issues });
      else st.setError(null);
    }
  };

  const onNodeClick = (_e: React.MouseEvent, node: Node) => {
    const st = useLab.getState();
    if (node.type === 'group') {
      st.select({ devices: (node.data as { members: string[] }).members, cables: [] });
      return;
    }
    if (node.type !== 'device' || node.id.startsWith('ghost:')) return;
    if (st.tool === 'cable') {
      if (st.pendingEnd && st.pendingEnd.device !== node.id) setPicker({ deviceId: node.id, stage: 'second', from: st.pendingEnd });
      else startCable(node.id);
      return;
    }
    if (st.tool === 'disconnect') {
      const d = deviceById(doc, node.id);
      const r = (_e.currentTarget as HTMLElement).getBoundingClientRect();
      const mine = doc.cables.filter((c) => c.a.device === node.id || c.b.device === node.id);
      setMenu({
        x: r.right,
        y: r.top,
        title: mine.length ? `Unplug a cable from ${d?.name}` : `${d?.name} has no cables`,
        items: mine.map((c) => {
          const me = c.a.device === node.id ? c.a : c.b;
          const far = c.a.device === node.id ? c.b : c.a;
          return { label: `${me.port} → ${deviceById(doc, far.device)?.name ?? '?'} ${far.port}`, danger: true, onSelect: () => disconnect(c.id) };
        }),
      });
      return;
    }
    if (st.tool === 'simulate') {
      if (!st.simSrc || (st.simSrc && st.simDst)) st.setView({ simSrc: node.id, simDst: '' });
      else st.setView({ simDst: node.id });
      return;
    }
  };

  const deviceMenu = (d: Device, x: number, y: number) => {
    const st = useLab.getState();
    if (!st.selection.devices.includes(d.id)) st.select({ devices: [d.id], cables: [] });
    const hasConsole = !!d.nodeId && d.consoles.length > 0;
    setMenu({
      x,
      y,
      title: d.name,
      items: [
        { label: 'Inspect', hint: 'Enter', onSelect: () => st.openInspector('overview') },
        { label: 'Open terminal', disabled: !d.nodeId, hint: d.nodeId ? '' : 'design only', onSelect: () => actions.openTerminal(d.id) },
        { label: 'Open VM console', disabled: !hasConsole || !d.consoles.some((c) => c === 'rdp' || c === 'vnc'), onSelect: () => actions.openVm(d.id) },
        { label: 'Ping from here…', onSelect: () => actions.pingFrom(d.id) },
        { label: 'Start a cable here', hint: 'C', onSelect: () => startCable(d.id) },
        ...doc.cables
          .filter((c) => c.a.device === d.id || c.b.device === d.id)
          .slice(0, 10)
          .map((c) => {
            const mine = c.a.device === d.id ? c.a : c.b;
            const far = c.a.device === d.id ? c.b : c.a;
            return { label: `Disconnect ${mine.port} → ${deviceById(doc, far.device)?.name ?? '?'} ${far.port}`, danger: true, onSelect: () => disconnect(c.id) };
          }),
        { separator: true, label: '', onSelect: () => {} },
        { label: d.power === 'stopped' ? 'Power on' : 'Power off', onSelect: () => (d.origin === 'design' ? st.setPower(d.id, d.power === 'stopped' ? 'running' : 'stopped') : st.openInspector('actions')) },
        { label: 'Duplicate', hint: 'Ctrl+D', onSelect: () => st.duplicate([d.id]) },
        { label: 'Group selected devices', hint: 'Ctrl+G', disabled: st.selection.devices.length < 2, onSelect: () => st.group() },
        { label: 'Delete', hint: 'Del', danger: true, onSelect: () => st.deleteSelection() },
      ],
    });
  };

  /** Unplug a cable (Packet Tracer's delete tool), with Undo in a toast. */
  const disconnect = (cableId: string) => {
    const st = useLab.getState();
    const c = st.doc?.cables.find((k) => k.id === cableId);
    if (!c) return;
    const label = `${deviceById(st.doc!, c.a.device)?.name} ${c.a.port} ↔ ${deviceById(st.doc!, c.b.device)?.name} ${c.b.port}`;
    st.removeCable(cableId);
    useUi.getState().toast({ tone: 'info', title: 'Cable disconnected', body: label, action: { label: 'Undo', onClick: () => useLab.getState().undo() } });
  };
  disconnectRef.current = disconnect;

  const cableMenu = (cableId: string, x: number, y: number) => {
    const st = useLab.getState();
    st.select({ devices: [], cables: [cableId] });
    const c = doc.cables.find((k) => k.id === cableId)!;
    setMenu({
      x,
      y,
      title: `${deviceById(doc, c.a.device)?.name} ${c.a.port} ↔ ${deviceById(doc, c.b.device)?.name} ${c.b.port}`,
      items: [
        { label: 'Inspect', onSelect: () => st.openInspector('cable') },
        { label: 'Replace cable…', onSelect: () => actions.replaceCable(cableId) },
        { label: c.disabled ? 'Bring link up (keep cable)' : 'Take link down (keep cable)', onSelect: () => st.updateCable(cableId, { disabled: !c.disabled }) },
        { label: 'Test link', onSelect: () => { const r = linkTestSummary(useLab.getState().doc!, cableId); st.setError({ title: r.title, issues: r.issues, tone: r.ok ? 'ok' : 'error' }); } },
        { label: 'Straighten', disabled: !c.bend, onSelect: () => st.updateCable(cableId, { bend: undefined }) },
        { separator: true, label: '', onSelect: () => {} },
        { label: 'Disconnect cable', danger: true, hint: 'Del', onSelect: () => disconnect(cableId) },
      ],
    });
  };

  const paneMenu = (x: number, y: number) => {
    const st = useLab.getState();
    const p = rf.screenToFlowPosition({ x, y });
    setMenu({
      x,
      y,
      title: 'Canvas',
      items: [
        ...(['router', 'switch', 'firewall', 'server', 'pc', 'laptop', 'ap', 'cloud', 'vm', 'iot'] as const).map((k) => ({ label: `Add ${KIND_LABEL[k].toLowerCase()} here`, onSelect: () => st.addDevice(DEFAULT_MODEL[k], p.x, p.y) })),
        { separator: true, label: '', onSelect: () => {} },
        { label: 'New cable…', onSelect: () => actions.newCable() },
        { label: 'Paste', hint: 'Ctrl+V', disabled: !st.clipboard, onSelect: () => st.paste() },
        { label: 'Select all', hint: 'Ctrl+A', onSelect: () => st.select({ devices: st.doc!.devices.map((d) => d.id), cables: [] }) },
        { label: 'Fit to screen', hint: 'F', onSelect: () => rf.fitView({ padding: 0.1 }) },
      ],
    });
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useLab.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault();
        st.redo();
      } else if (mod && k === 'd') {
        e.preventDefault();
        st.duplicate();
      } else if (mod && k === 'c') st.copy();
      else if (mod && k === 'v') st.paste();
      else if (mod && k === 'a') {
        e.preventDefault();
        st.select({ devices: st.doc!.devices.map((d) => d.id), cables: [] });
      } else if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) st.ungroup();
        else st.group();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (noteSelRef.current && !st.selection.devices.length && !st.selection.cables.length) {
          st.removeAnnotation(noteSelRef.current);
          setNoteSel(null);
        } else if (st.selection.cables.length === 1 && !st.selection.devices.length) disconnectRef.current?.(st.selection.cables[0]);
        else st.deleteSelection();
      } else if (e.key === 'Escape') {
        setPicker(null);
        setMenu(null);
        if (st.pendingEnd) st.setPendingEnd(null);
        else if (st.tool !== 'select') st.setTool('select');
        else st.clearSelection();
      } else if (e.key.startsWith('Arrow')) {
        if (!st.selection.devices.length) return;
        e.preventDefault();
        const step = e.shiftKey ? GRID * 4 : st.snap ? GRID : 2;
        st.nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      } else if (!mod && k === 'c') st.setTool(st.tool === 'cable' ? 'select' : 'cable');
      else if (!mod && k === 'v') st.setTool('select');
      else if (!mod && k === 'x') st.setTool(st.tool === 'disconnect' ? 'select' : 'disconnect');
      else if (!mod && k === 's') st.setTool(st.tool === 'simulate' ? 'select' : 'simulate');
      else if (!mod && k === 'f') rf.fitView({ padding: 0.1 });
      else if (!mod && k === 'l') st.setView({ portLabels: !st.portLabels });
      else if (e.key === 'Enter' && (st.selection.devices.length || st.selection.cables.length)) st.openInspector(st.selection.cables.length ? 'cable' : 'overview');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf]);

  // Fit once the document first renders.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !nodes.length) return;
    fitted.current = true;
    setTimeout(() => rf.fitView({ padding: 0.08 }), 60);
  }, [nodes.length, rf]);

  const pickerFrom = picker?.stage === 'second' || picker?.stage === 'reconnect' ? picker.from : undefined;
  return (
    <div
      ref={wrap}
      className="relative h-full w-full bg-ink"
      style={s.background === 'grid' ? undefined : { backgroundImage: `linear-gradient(rgba(4, 16, 30, 0.76), rgba(4, 16, 30, 0.76)), url(${s.background === 'custom' ? s.customBackground : BACKGROUND_IMAGE[s.background]})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/aegis-model') || e.dataTransfer.types.includes('application/aegis-cable')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const model = e.dataTransfer.getData('application/aegis-model');
        const cable = e.dataTransfer.getData('application/aegis-cable') as CableType | '';
        if (!model && !cable) return;
        e.preventDefault();
        if (cable) {
          useLab.getState().setCableType(cable);
          useLab.getState().setTool('cable');
          return;
        }
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        useLab.getState().addDevice(model, p.x, p.y);
      }}
      data-testid="lab-canvas"
      data-tool={s.tool}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(_, n) => n.type === 'device' && !n.id.startsWith('ghost:') && useLab.getState().openInspector('overview')}
        onEdgeDoubleClick={() => useLab.getState().tool !== 'disconnect' && useLab.getState().openInspector('cable')}
        onEdgeClick={(_e, edge) => {
          if (useLab.getState().tool === 'disconnect' && !edge.id.startsWith('ghost:')) disconnect(edge.id);
        }}
        onNodeDragStart={(_, __, ns) => {
          dragStart.current = Object.fromEntries(ns.map((n) => [n.id, { ...n.position }]));
        }}
        onNodeDrag={(_, node) => {
          if (node.type !== 'group') return;
          const start = dragStart.current[node.id];
          if (!start) return;
          const dx = node.position.x - start.x;
          const dy = node.position.y - start.y;
          const members = new Set((node.data as { members: string[] }).members);
          setNodes((ns) => ns.map((n) => (members.has(n.id) ? { ...n, position: { x: (deviceById(doc, n.id)?.x ?? 0) + dx, y: (deviceById(doc, n.id)?.y ?? 0) + dy } } : n)));
        }}
        onNodeDragStop={(_, node, ns) => {
          const pos: Record<string, { x: number; y: number }> = {};
          if (node.type === 'group') {
            const start = dragStart.current[node.id];
            const dx = node.position.x - (start?.x ?? node.position.x);
            const dy = node.position.y - (start?.y ?? node.position.y);
            for (const id of (node.data as { members: string[] }).members) {
              const d = deviceById(doc, id);
              if (d) pos[id] = { x: d.x + dx, y: d.y + dy };
            }
          }
          for (const n of ns)
            if (n.type === 'note') {
              const a = (n.data as NoteNodeData).note;
              if (a.x !== n.position.x || a.y !== n.position.y) useLab.getState().updateAnnotation(a.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) });
            }
          for (const n of ns) if (n.type === 'device') {
            const d = deviceById(doc, n.id);
            if (d && (d.x !== n.position.x || d.y !== n.position.y)) pos[n.id] = n.position;
          }
          if (Object.keys(pos).length) useLab.getState().moveDevices(pos);
        }}
        onConnect={(c) => c.source && c.target && c.source !== c.target && startCable(c.source, c.target)}
        onNodeContextMenu={(e, n) => {
          e.preventDefault();
          if (n.type === 'device' && !n.id.startsWith('ghost:')) deviceMenu((n.data as DeviceNodeData).device, e.clientX, e.clientY);
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          if (!edge.id.startsWith('ghost:')) cableMenu(edge.id, e.clientX, e.clientY);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          paneMenu(e.clientX, e.clientY);
        }}
        onPaneClick={() => {
          setMenu(null);
          const st = useLab.getState();
          if (st.pendingEnd) st.setPendingEnd(null);
        }}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={s.snap}
        snapGrid={[GRID, GRID]}
        selectionOnDrag={false}
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionKeyCode="Shift"
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={s.tool === 'cable'}
        elevateEdgesOnSelect
        aria-label="Lab topology canvas"
      >
        <Background id="minor" variant={BackgroundVariant.Dots} gap={GRID} size={1} color="var(--line)" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={GRID * 8} lineWidth={0.5} color="var(--line)" />
        {miniMap && <MiniMap pannable zoomable ariaLabel="Mini map" style={{ width: 168, height: 112 }} nodeStrokeWidth={2} nodeColor={(n) => (n.type !== 'device' ? 'transparent' : (n.data as DeviceNodeData).device.power === 'stopped' || (n.data as DeviceNodeData).device.health === 'down' ? '#e5484d' : (n.data as DeviceNodeData).device.health === 'degraded' ? '#e5a23a' : '#2fb36a')} maskColor="color-mix(in srgb, var(--ink) 55%, transparent)" className="!bg-pane/90 rounded-[6px] border border-line" />}
        <Controls showInteractive={false}>
          <ControlButton onClick={() => setMiniMap(!miniMap)} title={miniMap ? 'Hide mini map' : 'Show mini map'} aria-label={miniMap ? 'Hide mini map' : 'Show mini map'} aria-pressed={miniMap} data-testid="toggle-minimap">
            <MapIcon />
          </ControlButton>
        </Controls>
        <PacketLayer />
        {ghost && (
          <ViewportPortal>
            <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }}>
              <line x1={ghost.from.x} y1={ghost.from.y} x2={ghost.to.x} y2={ghost.to.y} stroke="var(--action)" strokeWidth={2} strokeDasharray="5 4" />
            </svg>
          </ViewportPortal>
        )}
      </ReactFlow>
      <ErrorBanner />
      {s.tool === 'cable' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-action/50 bg-pane px-3 py-1 text-[12.5px] shadow" role="status" data-testid="cable-hint">
          {s.pendingEnd ? `Cable from ${deviceById(doc, s.pendingEnd.device)?.name} ${s.pendingEnd.port}: click the second device. Esc cancels.` : 'Cable tool: click a device (or drag from one device to another). Esc to stop.'}
        </div>
      )}
      {s.tool === 'disconnect' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-down/60 bg-pane px-3 py-1 text-[12.5px] shadow" role="status" data-testid="disconnect-hint">
          Disconnect: click a cable to unplug it, or click a device to choose a port. Esc to stop.
        </div>
      )}
      {s.tool === 'simulate' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-action/50 bg-pane px-3 py-1 text-[12.5px] shadow" role="status">
          Simulation: click a source device, then a destination. Set protocol and send below.
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      <PortPicker
        open={!!picker}
        deviceId={picker?.deviceId ?? null}
        from={pickerFrom}
        ignoreCableId={picker?.stage === 'reconnect' ? picker.cableId : undefined}
        showType={picker?.stage !== 'reconnect'}
        title={picker ? `${picker.stage === 'first' ? 'Choose the first port' : picker.stage === 'second' ? 'Choose the second port' : 'Move the cable end to'} on ${deviceById(doc, picker.deviceId)?.name}` : ''}
        onPick={onPick}
        onCancel={() => setPicker(null)}
      />
    </div>
  );
}

/** Must be rendered inside a ReactFlowProvider (the lab page provides one so the palette can place devices). */
export function LabCanvas({ actions }: { actions: CanvasActions }) {
  return <Inner actions={actions} />;
}

export { ReactFlowProvider as LabFlowProvider };
