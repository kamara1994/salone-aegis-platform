// @vitest-environment jsdom
// IOS habits a CCNA student types without thinking: abbreviations, ? help, Tab, pipes, ambiguity.
import { beforeEach, describe, expect, it } from 'vitest';
import { ARENA_PREFIX, arenaLab } from '@/lab/arena';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';

let c: DesignCli;
beforeEach(() => {
  useLab.getState().init('ios', emptyDoc(), emptyDoc());
  const lab = arenaLab('vlan-challenge-roas')!;
  useLab.getState().startWorkbook(lab.build(), ARENA_PREFIX + lab.id, lab.title);
  c = new DesignCli('sw1');
});

describe('IOS CLI behaviour', () => {
  it('"en" means enable in user EXEC, and abbreviations configure the switch', () => {
    c.exec('en');
    expect(c.prompt()).toBe('SW1# ');
    for (const l of ['conf t', 'int g0/1', 'sw mo acc', 'sw acc vl 10', 'end']) c.exec(l);
    expect(c.exec('sh vl br')).toMatch(/10\s+VLAN0010\s+active\s+Gi0\/1/);
  });
  it('rejects an ambiguous first word like IOS', () => {
    c.exec('en');
    expect(c.exec('e')).toMatch(/% Ambiguous command/);
    expect(c.prompt()).toBe('SW1# ');
  });
  it('answers ? for a whole word and for a partial word', () => {
    c.exec('en');
    expect(c.exec('show ?')).toMatch(/running-config\s+Current operating configuration/);
    expect(c.contextHelp('sh ip ')).toMatch(/interface\s+IP interface status/);
    expect(c.contextHelp('s')).toBe('show');
    c.exec('conf t');
    expect(c.contextHelp('switchport mode ')).toBe('% Unrecognized command'); // switchport is an interface command
    c.exec('int g0/1');
    expect(c.contextHelp('switchport mode ')).toMatch(/access[\s\S]*trunk[\s\S]*dynamic/);
    expect(c.contextHelp('do sh ')).toMatch(/vlan/);
  });
  it('completes the last word with Tab only when it is unique', () => {
    c.exec('en');
    expect(c.tabComplete('sh')).toBe('show ');
    expect(c.tabComplete('conf')).toBe('configure ');
    expect(c.tabComplete('sh ip int')).toBe('sh ip interface ');
    expect(c.tabComplete('e')).toBeNull();
  });
  it('filters show output with include, exclude, begin and section', () => {
    c.exec('en');
    c.exec('conf t');
    c.exec('hostname CORE');
    c.exec('end');
    expect(c.exec('show run | include hostname')).toBe('hostname CORE');
    expect(c.exec('sh run | sec line con')).toMatch(/^line con 0\r\n logging synchronous$/);
    expect(c.exec('sh run | begin line')).toMatch(/^line con 0/);
    expect(c.exec('sh run | exclude interface')).not.toMatch(/^interface/m);
  });
  it('knows show clock, history and users', () => {
    c.exec('en');
    expect(c.exec('show clock')).toMatch(/^\*\d\d:\d\d:\d\d\.\d{3} UTC \w{3} \w{3} \d+ \d{4}$/);
    expect(c.exec('show history')).toMatch(/en[\s\S]*show clock/);
    expect(c.exec('show users')).toMatch(/con 0/);
  });
});
