// @vitest-environment jsdom
// Lab Arena: every lab starts unsolved with a valid topology, and solving it through the CLI the
// way a student would scores 100%. Also covers voice VLANs, hint penalties and attempt history.
import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_LABS, ARENA_PREFIX, arenaLab } from '@/lab/arena';
import { gradeArena } from '@/lab/arena/grade';
import { bestFor, readArena, resetArenaCache, topicMastery, updateArena } from '@/lab/arena/progress';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';
import { cableStatus } from '@/lab/validate';

const st = () => useLab.getState();
const run = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};
const start = (id: string) => {
  const lab = arenaLab(id)!;
  st().startWorkbook(lab.build(), ARENA_PREFIX + lab.id, lab.title);
  return lab;
};
const grade = (id: string, hinted?: Set<string>) => gradeArena(arenaLab(id)!, st().doc!, st().log, hinted);
const missing = (id: string) => {
  const g = grade(id);
  return [...g.items, ...g.tests].filter((x) => !x.ok).map((x) => `${x.id}: ${x.detail ?? ''}`);
};

beforeEach(() => {
  window.localStorage.clear();
  resetArenaCache();
  st().init('arena', emptyDoc(), emptyDoc());
});

describe('lab arena catalog', () => {
  it.each(ARENA_LABS.map((l) => [l.id, l]))('%s: valid topology, unique ids, not solved at start', (_id, lab) => {
    const doc = lab.build();
    for (const c of doc.cables) expect(cableStatus(doc, c).issues.filter((i) => i.severity === 'error'), `${c.a.device}/${c.a.port}`).toEqual([]);
    expect(new Set(lab.items.map((i) => i.id)).size).toBe(lab.items.length);
    expect(new Set(lab.tests.map((i) => i.id)).size).toBe(lab.tests.length);
    st().startWorkbook(doc, ARENA_PREFIX + lab.id, lab.title);
    const g = gradeArena(lab, st().doc!, []);
    expect(g.max).toBeGreaterThanOrEqual(90);
    expect(g.pct).toBeLessThan(60);
  });
});

describe('lab arena: solved through the CLI', () => {
  it('first VLANs', () => {
    start('vlan-first');
    run('sw1', 'conf t', 'vlan 10', 'name STAFF', 'vlan 20', 'name GUEST', 'exit', 'interface range g0/1 - 2', 'switchport mode access', 'switchport access vlan 10', 'exit', 'interface range g0/3 - 4', 'switchport mode access', 'switchport access vlan 20', 'end');
    expect(missing('vlan-first')).toEqual([]);
    expect(grade('vlan-first').pct).toBe(100);
  });

  it('trunk with native VLAN and DTP off', () => {
    start('vlan-trunk-native');
    for (const s of ['sw1', 'sw2']) run(s, 'conf t', 'vlan 999', 'name NATIVE', 'exit', 'int g0/24', 'switchport mode trunk', 'switchport nonegotiate', 'switchport trunk native vlan 999', 'switchport trunk allowed vlan 10,20,999', 'end');
    expect(missing('vlan-trunk-native')).toEqual([]);
  });

  it('Hillview floor skills assessment, including voice VLAN traffic', () => {
    start('vlan-hillview-floor');
    const vl = ['vlan 10', 'name STAFF', 'vlan 20', 'name GUEST', 'vlan 30', 'name VOICE', 'vlan 99', 'name MGMT', 'vlan 999', 'name NATIVE', 'exit'];
    const tr = ['switchport mode trunk', 'switchport nonegotiate', 'switchport trunk native vlan 999', 'switchport trunk allowed vlan 10,20,30,99,999'];
    run('dist', 'conf t', ...vl, 'interface range g0/1 - 2', ...tr, 'exit', 'int g0/10', 'switchport mode access', 'switchport access vlan 30', 'exit', 'interface vlan 99', 'ip address 10.30.99.1 255.255.255.0', 'no shutdown', 'end');
    for (const [s, ip] of [['acc1', '10.30.99.11'], ['acc2', '10.30.99.12']]) {
      run(s, 'conf t', ...vl, 'vlan 666', 'name PARKING', 'exit', 'int g0/24', ...tr, 'exit', 'int g0/1', 'switchport mode access', 'switchport access vlan 10', 'exit', 'int g0/2', 'switchport mode access', 'switchport access vlan 10', 'switchport voice vlan 30', 'exit', 'interface range g0/5 - 20', 'switchport access vlan 666', 'shutdown', 'exit', 'interface vlan 99', `ip address ${ip} 255.255.255.0`, 'no shutdown', 'exit', 'ip default-gateway 10.30.99.1', 'end');
    }
    run('acc2', 'conf t', 'int g0/3', 'switchport mode access', 'switchport access vlan 20', 'end');
    expect(missing('vlan-hillview-floor')).toEqual([]);
    expect(run('acc1', 'show interfaces g0/2 switchport')).toMatch(/Voice VLAN: 30 \(VOICE\)/);
    expect(run('acc1', 'show running-config')).toMatch(/switchport voice vlan 30/);
  });

  it('Bo branch troubleshooting: fixing the drifted side scores full marks', () => {
    start('vlan-bo-tickets');
    expect(grade('vlan-bo-tickets').tests.find((t) => t.id === 't-fin')!.ok).toBe(false);
    run('sw1', 'conf t', 'int g0/24', 'switchport trunk allowed vlan add 10', 'end');
    run('sw2', 'conf t', 'int g0/24', 'switchport trunk native vlan 99', 'exit', 'int g0/2', 'switchport access vlan 20', 'end');
    expect(missing('vlan-bo-tickets')).toEqual([]);
  });

  it('Bo branch: "fixing" the native VLAN on the wrong side loses the design item', () => {
    start('vlan-bo-tickets');
    run('sw1', 'conf t', 'int g0/24', 'switchport trunk native vlan 1', 'end');
    const g = grade('vlan-bo-tickets');
    expect(g.items.find((i) => i.id === 'design')!.ok).toBe(false);
  });

  it('Kamara new switch: DTP, missing VLAN and voice VLAN', () => {
    start('vlan-kamara-newswitch');
    expect(run('sw2', 'show interfaces g0/24 switchport')).toMatch(/Administrative Mode: dynamic auto/);
    run('sw2', 'conf t', 'vlan 10', 'name USERS', 'exit', 'int g0/24', 'switchport mode trunk', 'exit', 'int g0/2', 'switchport voice vlan 30', 'end');
    expect(missing('vlan-kamara-newswitch')).toEqual([]);
  });

  it('timed router-on-a-stick challenge from blank', () => {
    start('vlan-challenge-roas');
    run('sw1', 'conf t', 'vlan 10', 'name SALES', 'vlan 20', 'name ENG', 'vlan 30', 'name ADMIN', 'vlan 99', 'name MGMT', 'exit', 'int g0/1', 'switchport mode access', 'switchport access vlan 10', 'int g0/2', 'switchport mode access', 'switchport access vlan 20', 'int g0/3', 'switchport mode access', 'switchport access vlan 30', 'int g0/24', 'switchport mode trunk', 'exit', 'interface vlan 99', 'ip address 192.168.99.2 255.255.255.0', 'no shutdown', 'exit', 'ip default-gateway 192.168.99.1', 'end');
    const sub = (v: number) => [`interface g0/0/0.${v}`, `encapsulation dot1Q ${v}`, `ip address 192.168.${v}.1 255.255.255.0`, 'exit'];
    run('r1', 'conf t', 'int g0/0/0', 'no shutdown', 'exit', ...sub(10), ...sub(20), ...sub(30), ...sub(99), 'end');
    expect(missing('vlan-challenge-roas')).toEqual([]);
  });
});

describe('lab arena scoring and history', () => {
  it('a hinted item earns half its points', () => {
    start('vlan-first');
    run('sw1', 'conf t', 'vlan 10', 'name STAFF', 'end');
    const plain = grade('vlan-first').items.find((i) => i.id === 'v10')!;
    const hinted = grade('vlan-first', new Set(['v10'])).items.find((i) => i.id === 'v10')!;
    expect(plain.earned).toBe(10);
    expect(hinted.earned).toBe(5);
  });

  it('records attempts, best score and topic mastery', () => {
    const labs = ARENA_LABS.filter((l) => l.topicId === 'ch8-vlans');
    updateArena((p) => {
      p.attempts.push({ labId: 'vlan-first', startedAt: 'a', finishedAt: 'b', seconds: 300, score: 60, max: 100, pct: 60, hints: 1, timedOut: false, missed: [] });
      p.attempts.push({ labId: 'vlan-first', startedAt: 'c', finishedAt: 'd', seconds: 200, score: 100, max: 100, pct: 100, hints: 0, timedOut: false, missed: [] });
    });
    resetArenaCache();
    const p = readArena();
    expect(bestFor(p, 'vlan-first')?.pct).toBe(100);
    expect(topicMastery(p, labs)).toEqual({ pct: Math.round(100 / labs.length), done: 1, total: labs.length });
  });
});
