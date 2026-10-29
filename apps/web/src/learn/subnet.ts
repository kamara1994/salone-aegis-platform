// Subnetting drills. Generated and checked by arithmetic, so they work offline and never repeat.
import { intToIp, ipToInt, maskOf, prefixToMask } from '@/lab/net';

export type DrillKind = 'network' | 'broadcast' | 'first' | 'last' | 'hosts' | 'mask' | 'fit';
export interface Drill {
  kind: DrillKind;
  prompt: string;
  answer: string;
  explain: string;
}

const rnd = (lo: number, hi: number, r: () => number) => lo + Math.floor(r() * (hi - lo + 1));

export function makeDrill(r: () => number = Math.random, kinds: DrillKind[] = ['network', 'broadcast', 'first', 'last', 'hosts', 'mask', 'fit']): Drill {
  const kind = kinds[rnd(0, kinds.length - 1, r)];
  if (kind === 'fit') {
    const hosts = rnd(2, 2000, r);
    let p = 32;
    while (p > 0 && 2 ** (32 - p) - 2 < hosts) p--;
    return { kind, prompt: `What is the longest prefix (smallest subnet) that holds ${hosts} hosts?`, answer: `/${p}`, explain: `/${p} gives 2^${32 - p} − 2 = ${2 ** (32 - p) - 2} usable hosts; /${p + 1} would give only ${2 ** (31 - p) - 2}.` };
  }
  const prefix = rnd(16, 30, r);
  const first = [10, 172, 192][rnd(0, 2, r)];
  const ip = first === 10 ? `10.${rnd(0, 255, r)}.${rnd(0, 255, r)}.${rnd(1, 254, r)}` : first === 172 ? `172.${rnd(16, 31, r)}.${rnd(0, 255, r)}.${rnd(1, 254, r)}` : `192.168.${rnd(0, 255, r)}.${rnd(1, 254, r)}`;
  const n = ipToInt(ip)!;
  const m = maskOf(prefix);
  const net = (n & m) >>> 0;
  const bc = (net | (~m >>> 0)) >>> 0;
  const size = 2 ** (32 - prefix);
  const block = `Block size ${size}: ${intToIp(net)} to ${intToIp(bc)}.`;
  switch (kind) {
    case 'network':
      return { kind, prompt: `Network address of ${ip}/${prefix}?`, answer: intToIp(net), explain: `${block} AND the address with ${prefixToMask(prefix)}.` };
    case 'broadcast':
      return { kind, prompt: `Broadcast address of ${ip}/${prefix}?`, answer: intToIp(bc), explain: `${block} The broadcast is the last address in the block.` };
    case 'first':
      return { kind, prompt: `First usable host in ${ip}/${prefix}?`, answer: intToIp(net + 1), explain: `${block} First host = network + 1.` };
    case 'last':
      return { kind, prompt: `Last usable host in ${ip}/${prefix}?`, answer: intToIp(bc - 1), explain: `${block} Last host = broadcast − 1.` };
    case 'hosts':
      return { kind, prompt: `How many usable hosts in a /${prefix}?`, answer: String(size - 2), explain: `2^(32 − ${prefix}) − 2 = ${size} − 2 = ${size - 2}.` };
    default:
      return { kind: 'mask', prompt: `Dotted-decimal mask for /${prefix}?`, answer: prefixToMask(prefix), explain: `${prefix} one-bits followed by ${32 - prefix} zero-bits. Wildcard: ${intToIp(~m >>> 0)}.` };
  }
}

export function checkDrill(d: Drill, input: string): boolean {
  const a = input.trim().toLowerCase().replace(/\s+/g, '');
  const b = d.answer.toLowerCase();
  if (d.kind === 'fit') return a === b || `/${a}` === b;
  return a === b;
}
