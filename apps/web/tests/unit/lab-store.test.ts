// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Topology } from '@/api/types';
import { runningConfig } from '@/lab/config';
import { diffDocs } from '@/lab/diff';
import { buildDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';
import { cableStatus } from '@/lab/validate';
import { MockEngine } from '@/mock/engine';
import { initialLab } from '@/mock/lab';

let topo: Topology;
beforeAll(async () => {
  window.localStorage.clear();
  topo = await new MockEngine().getTopology();
});
beforeEach(() => {
  window.localStorage.removeItem('aegis.lab.draft.v1:simulated-lab');
  const doc = buildDoc(topo, initialLab());
  useLab.getState().init(doc.source, doc, buildDoc(topo, initialLab()));
});
const st = () => useLab.getState();
const byName = (n: string) => st().doc!.devices.find((d) => d.name === n)!;

describe('lab designer store', () => {
  it('adds devices from the catalog with real ports and undoes/redoes', () => {
    const id = st().addDevice('c9300-24t', 100, 100);
    const d = st().doc!.devices.find((x) => x.id === id)!;
    expect(d.name).toBe('Switch0');
    expect(d.interfaces.filter((i) => i.name.startsWith('Gi1/0/')).length).toBe(24);
    expect(d.interfaces.filter((i) => i.name.startsWith('Te1/1/')).every((i) => i.type === 'sfp')).toBe(true);
    st().undo();
    expect(st().doc!.devices.some((x) => x.id === id)).toBe(false);
    st().redo();
    expect(st().doc!.devices.some((x) => x.id === id)).toBe(true);
  });

  it('a trunk cable configures both switch ports as trunks; validation errors do not change the document', () => {
    const a = st().addDevice('c2960x24', 0, 0);
    const b = st().addDevice('c2960x24', 300, 0);
    const before = st().doc!.cables.length;
    const bad = st().connect({ device: a, port: 'Gi0/25' }, { device: b, port: 'Gi0/1' }, 'fiber');
    expect(bad.ok).toBe(false);
    expect(st().doc!.cables.length).toBe(before);
    const ok = st().connect({ device: a, port: 'Gi0/24' }, { device: b, port: 'Gi0/24' }, 'trunk');
    expect(ok.ok).toBe(true);
    const pa = st().doc!.devices.find((d) => d.id === a)!.interfaces.find((i) => i.name === 'Gi0/24')!;
    expect(pa.mode).toBe('trunk');
    expect(cableStatus(st().doc!, st().doc!.cables.at(-1)!).state).toBe('up');
  });

  it('duplicates a selection with fresh ids and MACs, copying cables between the copies', () => {
    const a = st().addDevice('isr4331', 0, 0);
    const b = st().addDevice('optiplex', 200, 0);
    st().connect({ device: a, port: 'Gi0/0/0' }, { device: b, port: 'Ethernet' }, 'crossover');
    st().select({ devices: [a, b], cables: [] });
    const copies = st().duplicate();
    expect(copies).toHaveLength(2);
    const ca = st().doc!.devices.find((d) => d.id === copies[0])!;
    const orig = st().doc!.devices.find((d) => d.id === a)!;
    expect(ca.interfaces[0].mac).not.toBe(orig.interfaces[0].mac);
    expect(st().doc!.cables.filter((c) => copies.includes(c.a.device) && copies.includes(c.b.device))).toHaveLength(1);
  });

  it('aligns, groups and nudges the selection', () => {
    const ids = [st().addDevice('optiplex', 0, 0), st().addDevice('optiplex', 100, 160), st().addDevice('optiplex', 400, 80)];
    st().select({ devices: ids, cables: [] });
    st().align('top');
    const ys = new Set(st().doc!.devices.filter((d) => ids.includes(d.id)).map((d) => d.y));
    expect(ys.size).toBe(1);
    st().group('Desks');
    expect(st().doc!.groups.at(-1)?.name).toBe('Desks');
    expect(st().doc!.devices.filter((d) => ids.includes(d.id)).every((d) => d.groupId === st().doc!.groups.at(-1)!.id)).toBe(true);
    const x0 = st().doc!.devices.find((d) => d.id === ids[0])!.x;
    st().nudge(16, 0);
    expect(st().doc!.devices.find((d) => d.id === ids[0])!.x).toBe(x0 + 16);
  });

  it('saves and loads named layouts; reset to baseline undoes design changes', () => {
    st().addDevice('c9120', 0, 0);
    expect(st().saveLayout('With AP')).toBe(true);
    st().resetToBaseline();
    expect(st().doc!.devices.some((d) => d.kind === 'ap')).toBe(false);
    expect(st().layouts().map((l) => l.name)).toContain('With AP');
    st().loadLayout('With AP');
    expect(st().doc!.devices.some((d) => d.kind === 'ap')).toBe(true);
  });

  it('compares with the baseline: interface, cable and device changes', () => {
    const sw = byName('SW-ACC-01');
    st().updateIface(sw.id, 'Gi0/12', { vlan: 99 });
    st().removeCable(st().doc!.cables.find((c) => c.b.device === byName('DC02').id)!.id);
    st().addDevice('optiplex', 0, 0);
    const d = diffDocs(st().baseline!, st().doc!);
    expect(d.some((x) => x.kind === 'changed' && x.label === 'SW-ACC-01 Gi0/12' && x.detail?.includes('vlan 20 → 99'))).toBe(true);
    expect(d.some((x) => x.kind === 'removed' && x.subject === 'cable')).toBe(true);
    expect(d.some((x) => x.kind === 'added' && x.subject === 'device')).toBe(true);
  });

  it('records link events when ports are shut down', () => {
    const sw = byName('SW-ACC-01');
    st().updateIface(sw.id, 'Gi0/4', { shutdown: true });
    expect(st().log.at(-1)?.text).toBe('%LINK-5-CHANGED: Interface Gi0/4, changed state to administratively down');
  });

  it('autosaves the draft and restores it on the next visit', () => {
    st().addDevice('axis-cam', 0, 0);
    const fresh = buildDoc(topo, initialLab());
    useLab.getState().init(fresh.source, fresh, fresh);
    expect(st().doc!.devices.some((d) => d.kind === 'iot')).toBe(true);
    expect(st().restoredAt).not.toBeNull();
  });
});

describe('generated configuration and live-mode honesty', () => {
  it('renders IOS, pf and Windows configuration from the model', () => {
    const doc = buildDoc(topo, initialLab());
    const find = (n: string) => doc.devices.find((d) => d.name === n)!;
    expect(runningConfig(find('SW-ACC-01'))).toContain('interface Gi0/24\n description Uplink to FW01\n switchport mode trunk');
    expect(runningConfig(find('FW01'))).toContain('block in log quick from any to any   # 99 Default deny (logged)');
    expect(runningConfig(find('WS-FIN-07'))).toContain('Default Gateway . . . . . . . . . : 10.10.20.1');
  });

  it('without the simulated lab, MACs are not invented and ports are marked inferred', () => {
    const doc = buildDoc(topo, null);
    expect(doc.source).toBe('live-topology');
    const sw = doc.devices.find((d) => d.name === 'SW-ACC-01')!;
    expect(sw.interfaces.every((i) => i.mac === '')).toBe(true);
    expect(sw.interfaces.every((i) => i.inferred)).toBe(true);
    expect(doc.cables.length).toBe(topo.links.length);
    // Reported links never show as invalid cabling just because ports were inferred.
    for (const c of doc.cables) expect(cableStatus(doc, c).issues.filter((i) => i.severity === 'error'), c.id).toEqual([]);
  });
});
