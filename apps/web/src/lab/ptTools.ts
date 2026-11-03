// Packet Tracer's working tools that live outside the saved design: Realtime vs Simulation mode,
// Simple PDUs (the envelope) with their list, and Inspect (magnifying glass) windows.
import { create } from 'zustand';
import { DesignCli } from './cli';
import { modelOf } from './catalog';
import { ping, primaryIp, type PacketTrace } from './simulate';
import { useLab } from './store';
import { deviceById } from './validate';

export interface SimplePdu {
  id: string;
  src: string;
  dst: string;
  /** ok once a reply came back, fail when it did not */
  last?: 'ok' | 'fail';
  fired: number;
  traceId?: string;
  reason?: string;
}

export type InspectKind = 'arp' | 'mac' | 'route' | 'nat' | 'ip' | 'vlan' | 'stp' | 'ospf';
export const INSPECT_LABEL: Record<InspectKind, string> = { arp: 'ARP table', mac: 'MAC address table', route: 'Routing table', nat: 'NAT translations', ip: 'Interfaces and IP addresses', vlan: 'VLAN table', stp: 'Spanning tree', ospf: 'OSPF neighbours' };
const IOS_CMD: Record<InspectKind, string> = { arp: 'show ip arp', mac: 'show mac address-table', route: 'show ip route', nat: 'show ip nat translations', ip: 'show ip interface brief', vlan: 'show vlan brief', stp: 'show spanning-tree', ospf: 'show ip ospf neighbor' };

/** What the magnifying glass offers for this kind of device. */
export function inspectOptions(deviceId: string): InspectKind[] {
  const d = deviceById(useLab.getState().doc!, deviceId);
  if (!d) return [];
  const m = modelOf(d);
  if (m.forwarding === 'host') return ['arp', 'ip'];
  if (d.kind === 'switch') return d.ipRouting ? ['mac', 'arp', 'route', 'vlan', 'stp', 'ip'] : ['mac', 'arp', 'vlan', 'stp', 'ip'];
  return ['arp', 'route', 'nat', 'ospf', 'ip'];
}

export interface InspectWin {
  id: string;
  device: string;
  kind: InspectKind;
  x: number;
  y: number;
}

interface PtState {
  /** Simulation mode is on (packets animate step by step) */
  sim: boolean;
  pdus: SimplePdu[];
  pduSrc: string | null;
  inspects: InspectWin[];
  /** Device the Inspect menu is open for, and where */
  inspectMenu: { device: string; x: number; y: number } | null;
  setPduSrc(id: string | null): void;
  addPdu(src: string, dst: string, animate: boolean): SimplePdu;
  fire(id: string, animate: boolean): void;
  removePdu(id: string): void;
  clearPdus(): void;
  openInspectMenu(m: PtState['inspectMenu']): void;
  openInspect(device: string, kind: InspectKind, x: number, y: number): void;
  closeInspect(id: string): void;
  moveInspect(id: string, x: number, y: number): void;
}

let n = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;

export const usePt = create<PtState>((set, get) => ({
  sim: false,
  pdus: [],
  pduSrc: null,
  inspects: [],
  inspectMenu: null,
  setPduSrc(pduSrc) {
    set({ pduSrc });
  },
  addPdu(src, dst, animate) {
    const p: SimplePdu = { id: uid('pdu'), src, dst, fired: 0 };
    set((s) => ({ pdus: [...s.pdus, p], pduSrc: null }));
    get().fire(p.id, animate);
    return get().pdus.find((x) => x.id === p.id)!;
  },
  fire(id, animate) {
    const st = useLab.getState();
    const p = get().pdus.find((x) => x.id === id);
    if (!p || !st.doc) return;
    const dst = deviceById(st.doc, p.dst);
    const target = dst ? primaryIp(dst) ?? p.dst : p.dst;
    let t: PacketTrace | undefined;
    if (!target || (dst && !primaryIp(dst))) {
      set((s) => ({ pdus: s.pdus.map((x) => (x.id === id ? { ...x, last: 'fail', fired: x.fired + 1, reason: `${dst?.name ?? 'The destination'} has no IP address` } : x)) }));
      return;
    }
    t = ping(st.doc, p.src, target, 1)[0];
    st.addTrace([t]);
    if (animate) st.setActiveTrace(t.id);
    set((s) => ({ pdus: s.pdus.map((x) => (x.id === id ? { ...x, last: t!.status === 'delivered' ? 'ok' : 'fail', fired: x.fired + 1, traceId: t!.id, reason: t!.reason } : x)) }));
  },
  removePdu(id) {
    set((s) => ({ pdus: s.pdus.filter((x) => x.id !== id) }));
  },
  clearPdus() {
    set({ pdus: [] });
  },
  openInspectMenu(inspectMenu) {
    set({ inspectMenu });
  },
  openInspect(device, kind, x, y) {
    set((s) => ({ inspects: [...s.inspects.filter((w) => !(w.device === device && w.kind === kind)), { id: uid('insp'), device, kind, x, y }], inspectMenu: null }));
  },
  closeInspect(id) {
    set((s) => ({ inspects: s.inspects.filter((w) => w.id !== id) }));
  },
  moveInspect(id, x, y) {
    set((s) => ({ inspects: s.inspects.map((w) => (w.id === id ? { ...w, x, y } : w)) }));
  },
}));

/** The table text for an Inspect window, live from the design. */
export function inspectText(deviceId: string, kind: InspectKind): string {
  const d = deviceById(useLab.getState().doc!, deviceId);
  if (!d) return 'Device removed.';
  const cli = new DesignCli(deviceId);
  if (modelOf(d).forwarding === 'host') return cli.inspect(kind === 'arp' ? 'arp -a' : 'ipconfig /all');
  return cli.inspect(IOS_CMD[kind]);
}
