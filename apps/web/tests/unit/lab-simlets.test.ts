// @vitest-environment jsdom
// Simlets: every answer key is checked against the simulator, so a question can never claim
// something the network does not actually do. Also covers the config lock and question grading.
import { beforeEach, describe, expect, it } from 'vitest';
import { arenaLab } from '@/lab/arena';
import { gradeArena } from '@/lab/arena/grade';
import { readArena, resetArenaCache } from '@/lab/arena/progress';
import { setAnswer, startArena, submitArena, takeHint } from '@/lab/arena/session';
import { DesignCli, LOCKED_MSG } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';
import { makeCtx } from '@/lab/workbooks';

const st = () => useLab.getState();
const cli = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};
const ping = (src: string, dst: string) => makeCtx(st().doc!).ping(src, dst).ok;

beforeEach(() => {
  window.localStorage.clear();
  resetArenaCache();
  st().init('arena', emptyDoc(), emptyDoc());
});

describe('simlet config lock', () => {
  it('blocks configuration, saving and host changes but allows show and ping', () => {
    startArena('sim-vlan-reach');
    expect(st().doc!.workbook?.readOnly).toBe(true);
    expect(cli('sw1', 'conf t')).toBe(LOCKED_MSG);
    expect(cli('sw1', 'write memory')).toBe(LOCKED_MSG);
    expect(cli('sw1', 'show vlan brief')).toMatch(/SALES/);
    expect(new DesignCli('s1').exec('netsh interface ip set address "Ethernet" static 10.20.10.99 255.255.255.0')).toMatch(/locked/);
    expect(new DesignCli('s1').exec('ping 10.20.10.12')).toMatch(/Received = 4/);
  });
  it('a normal lab is not locked', () => {
    startArena('vlan-bo-tickets');
    expect(cli('sw1', 'conf t')).toMatch(/Enter configuration commands/);
  });
});

describe('simlet answer keys match the simulator', () => {
  it('branch audit', () => {
    startArena('sim-vlan-reach');
    // q1: a and c succeed, b d e fail
    expect([ping('s1', '10.20.10.12'), ping('e1', '10.20.20.12'), ping('e2', '10.20.20.13'), ping('p1', '10.20.30.12'), ping('s2', '10.20.10.13')]).toEqual([true, false, true, false, false]);
    // q2: pruned on SW1 only
    expect(cli('sw1', 'show interfaces gi0/24 switchport')).toMatch(/Trunking VLANs Enabled: 10,30/);
    expect(cli('sw2', 'show vlan brief')).toMatch(/20\s+ENG/);
    // q3: inactive access port
    expect(cli('sw2', 'show interfaces gi0/4 switchport')).toMatch(/Access Mode VLAN: 30 \(Inactive\)/);
    expect(cli('sw2', 'show vlan brief')).not.toMatch(/Gi0\/4/);
  });

  it('branch audit fixes really work (q4, q5)', () => {
    startArena('sim-vlan-reach');
    st().doc!.workbook!.readOnly = false;
    cli('sw2', 'conf t', 'int g0/5', 'switchport access vlan 10', 'exit', 'vlan 30', 'end');
    expect(ping('s2', '10.20.10.13')).toBe(true);
    expect(ping('p1', '10.20.30.12')).toBe(true);
  });

  it('DTP forensics', () => {
    startArena('sim-vlan-dtp');
    const oper = (dev: string, port: string) => /Operational Mode: (\S+)/.exec(cli(dev, `show interfaces ${port} switchport`))![1];
    expect([oper('d', 'gi0/1'), oper('a1', 'gi0/24')]).toEqual(['trunk', 'trunk']);
    expect([oper('d', 'gi0/2'), oper('a2', 'gi0/24')]).toEqual(['static', 'static']);
    expect([oper('d', 'gi0/3'), oper('a3', 'gi0/24')]).toEqual(['trunk', 'static']);
    expect([oper('d', 'gi0/4'), oper('a4', 'gi0/24')]).toEqual(['trunk', 'trunk']);
    expect([1, 2, 3, 4].map((k) => ping(`pc${k}`, '10.40.10.5'))).toEqual([true, false, false, true]);
  });

  it('native VLAN mismatch and voice VLAN', () => {
    startArena('sim-vlan-native-voice');
    expect(cli('sw2', 'show logging')).toMatch(/%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0\/24 \(10\), with HQ-SW1 GigabitEthernet0\/24 \(999\)/);
    expect([ping('pb', '10.60.20.12'), ping('pa', '10.60.10.12'), ping('ph1', '10.60.50.5'), ping('ph2', '10.60.50.5')]).toEqual([true, false, true, false]);
    expect(cli('sw2', 'show interfaces gi0/6 switchport')).toMatch(/Voice VLAN: none/);
    expect(cli('sw2', 'show power inline')).toMatch(/PHONE-2/);
    st().doc!.workbook!.readOnly = false;
    cli('sw2', 'conf t', 'int g0/24', 'switchport trunk native vlan 999', 'exit', 'int g0/6', 'switchport voice vlan 50', 'end');
    expect([ping('pa', '10.60.10.12'), ping('ph2', '10.60.50.5')]).toEqual([true, true]);
  });

  it('TSHOOT ticket: device, technology, fix', () => {
    startArena('sim-vlan-ticket-roas');
    expect(ping('e1', '192.168.20.11')).toBe(true); // same VLAN works
    expect(ping('e1', '192.168.20.1')).toBe(false); // gateway does not
    expect(ping('ps', '192.168.30.10')).toBe(true); // Sales is fine
    expect(cli('r1', 'show running-config')).toMatch(/interface Gi0\/0\/0\.20[\s\S]*?encapsulation dot1Q 21/);
    st().doc!.workbook!.readOnly = false;
    cli('r1', 'conf t', 'interface gi0/0/0.20', 'encapsulation dot1Q 20', 'end');
    expect(ping('e1', '192.168.30.10')).toBe(true);
  });
});

describe('simlet grading', () => {
  it('all-or-nothing multi answers, hints halve points, answers recorded on submit', () => {
    startArena('sim-vlan-reach');
    const lab = arenaLab('sim-vlan-reach')!;
    setAnswer(lab.id, 'q1', ['a']); // only one of two
    setAnswer(lab.id, 'q2', ['a']);
    takeHint(lab.id, 'q2');
    setAnswer(lab.id, 'q3', ['a']);
    const g = gradeArena(lab, st().doc!, [], new Set(readArena().active!.hinted), readArena().active!.answers);
    expect(g.questions.find((q) => q.id === 'q1')!.earned).toBe(0);
    expect(g.questions.find((q) => q.id === 'q2')!.earned).toBe(10);
    expect(g.questions.find((q) => q.id === 'q3')!.earned).toBe(20);
    expect(g.completion).toBe(60); // 3 of 5 answered, correctness not leaked
    const out = submitArena(lab.id)!;
    expect(out.attempt.score).toBe(30);
    expect(out.attempt.missed).toEqual(['q1', 'q4', 'q5']);
  });

  it('a perfect simlet scores 100', () => {
    for (const id of ['sim-vlan-reach', 'sim-vlan-dtp', 'sim-vlan-native-voice', 'sim-vlan-ticket-roas']) {
      startArena(id);
      const lab = arenaLab(id)!;
      for (const q of lab.questions!) setAnswer(id, q.id, q.answer);
      expect(submitArena(id)!.attempt.pct, id).toBe(100);
    }
  });
});
