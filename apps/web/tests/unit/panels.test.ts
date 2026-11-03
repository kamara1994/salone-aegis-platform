import { describe, expect, it } from 'vitest';
import { MODEL_BY_KEY } from '@/lab/catalog';
import { PANELS, portLamp, sysLamp, type PortFacts } from '@/lab/panels';
import type { Device } from '@/lab/types';

const base: PortFacts = { cabled: true, state: 'up', shutdown: false, err: false, blocking: false, learning: false, speed: 100, duplex: 'full', poeCapable: false, off: false, post: false };

describe('panel layouts', () => {
  it('draws every port the model really has, once', () => {
    for (const [key, p] of Object.entries(PANELS)) {
      const real = MODEL_BY_KEY[key].ports().map((t) => t.name);
      const drawn = [...p.ports.map((x) => x.iface), ...p.rear];
      expect(new Set(drawn).size, key).toBe(drawn.length);
      expect([...drawn].sort(), key).toEqual([...real].sort());
    }
  });
  it('puts odd ports on top and even ports below, like a Catalyst', () => {
    const p = PANELS['c2960-24tt'];
    const y = (n: string) => p.ports.find((x) => x.iface === n)!.y;
    expect(y('Fa0/1')).toBeLessThan(y('Fa0/2'));
    expect(y('Fa0/13')).toBe(y('Fa0/1'));
    expect(p.ports.find((x) => x.iface === 'Fa0/2')!.flip).toBe(true);
  });
});

describe('port LED rules', () => {
  it('STAT: green with traffic, amber when STP blocks, alternating on errors, off when shut', () => {
    expect(portLamp('STAT', base)).toMatchObject({ c: 'green', blink: 2 });
    expect(portLamp('STAT', { ...base, blocking: true }).c).toBe('amber');
    expect(portLamp('STAT', { ...base, learning: true }).c).toBe('amber');
    expect(portLamp('STAT', { ...base, state: 'degraded' }).c).toBe('greenamber');
    expect(portLamp('STAT', { ...base, err: true }).c).toBe('amber');
    expect(portLamp('STAT', { ...base, shutdown: true }).c).toBe('off');
    expect(portLamp('STAT', { ...base, cabled: false }).c).toBe('off');
  });
  it('SPEED: off at 10, green at 100, blinking at 1000', () => {
    expect(portLamp('SPEED', { ...base, speed: 10 }).c).toBe('off');
    expect(portLamp('SPEED', { ...base, speed: 100 })).toMatchObject({ c: 'green', blink: 0 });
    expect(portLamp('SPEED', { ...base, speed: 1000 })).toMatchObject({ c: 'green', blink: 1 });
  });
  it('DUPLX: green at full, off at half', () => {
    expect(portLamp('DUPLX', base).c).toBe('green');
    expect(portLamp('DUPLX', { ...base, duplex: 'half' }).c).toBe('off');
  });
  it('all ports blink during POST and go dark when the power is off', () => {
    expect(portLamp('STAT', { ...base, post: true }).blink).toBe(1);
    expect(portLamp('STAT', { ...base, off: true }).c).toBe('off');
  });
});

describe('system LEDs', () => {
  const d = { power: 'running', health: 'healthy' } as Device;
  it('SYST blinks during boot, then stays green; amber on a fault', () => {
    expect(sysLamp('SYST', d, { post: true })).toMatchObject({ c: 'green', blink: 1 });
    expect(sysLamp('SYST', d, { post: false })).toMatchObject({ c: 'green', blink: 0 });
    expect(sysLamp('SYST', { ...d, health: 'down' }, { post: false }).c).toBe('amber');
    expect(sysLamp('SYST', { ...d, power: 'stopped' }, { post: false }).c).toBe('off');
  });
  it('lights the selected mode LED only', () => {
    expect(sysLamp('SPEED', d, { post: false, mode: 'SPEED' }).c).toBe('green');
    expect(sysLamp('STAT', d, { post: false, mode: 'SPEED' }).c).toBe('off');
  });
});
