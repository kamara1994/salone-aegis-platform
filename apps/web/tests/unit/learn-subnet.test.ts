import { describe, expect, it } from 'vitest';
import { checkDrill, makeDrill } from '@/learn/subnet';
import { ipToInt, maskOf } from '@/lab/net';

describe('subnetting drills', () => {
  it('network, broadcast and host answers are arithmetically right for many random drills', () => {
    for (let k = 0; k < 400; k++) {
      const d = makeDrill(Math.random, ['network', 'broadcast', 'first', 'last']);
      const m = /([\d.]+)\/(\d+)/.exec(d.prompt)!;
      const ip = ipToInt(m[1])!;
      const p = Number(m[2]);
      const net = (ip & maskOf(p)) >>> 0;
      const bc = (net | (~maskOf(p) >>> 0)) >>> 0;
      const want = { network: net, broadcast: bc, first: net + 1, last: bc - 1 }[d.kind as 'network']!;
      expect(ipToInt(d.answer), d.prompt).toBe(want);
      expect(checkDrill(d, ` ${d.answer} `)).toBe(true);
    }
  });

  it('prefix-for-hosts picks the smallest subnet that fits', () => {
    for (let k = 0; k < 200; k++) {
      const d = makeDrill(Math.random, ['fit']);
      const hosts = Number(/holds (\d+)/.exec(d.prompt)![1]);
      const p = Number(d.answer.slice(1));
      expect(2 ** (32 - p) - 2).toBeGreaterThanOrEqual(hosts);
      expect(2 ** (31 - p) - 2).toBeLessThan(hosts);
      expect(checkDrill(d, String(p))).toBe(true);
    }
  });
});
