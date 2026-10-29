// IPv4 helpers for the lab designer and packet simulator.

export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isIp(s: string | undefined): s is string {
  return !!s && ipToInt(s) !== null;
}

export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMask(prefix: number): string {
  return intToIp(maskOf(prefix));
}

export function maskToPrefix(mask: string): number | null {
  const n = ipToInt(mask);
  if (n === null) return null;
  const bits = n.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bits)) return null;
  return bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
}

export function parseCidr(cidr: string): { net: number; prefix: number } | null {
  const [ip, p] = cidr.split('/');
  const n = ipToInt(ip ?? '');
  const prefix = Number(p);
  if (n === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { net: (n & maskOf(prefix)) >>> 0, prefix };
}

export function networkOf(ip: string, prefix: number): string {
  const n = ipToInt(ip);
  return n === null ? '' : `${intToIp((n & maskOf(prefix)) >>> 0)}/${prefix}`;
}

export function inCidr(ip: string, cidr: string): boolean {
  const c = parseCidr(cidr);
  const n = ipToInt(ip);
  if (!c || n === null) return false;
  return ((n & maskOf(c.prefix)) >>> 0) === c.net;
}

export function sameSubnet(a: string, b: string, prefix: number): boolean {
  const x = ipToInt(a);
  const y = ipToInt(b);
  if (x === null || y === null) return false;
  const m = maskOf(prefix);
  return ((x & m) >>> 0) === ((y & m) >>> 0);
}

export function isPrivate(ip: string): boolean {
  return inCidr(ip, '10.0.0.0/8') || inCidr(ip, '172.16.0.0/12') || inCidr(ip, '192.168.0.0/16');
}

/** Deterministic locally administered-looking MAC from a seed, formatted the Cisco way when asked. */
export function macFor(seed: string, vendorPrefix = '00:50:56'): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const tail = [(h >>> 16) & 255, (h >>> 8) & 255, h & 255].map((b) => b.toString(16).padStart(2, '0'));
  return `${vendorPrefix}:${tail.join(':')}`;
}

export function ciscoMac(mac: string): string {
  const hex = mac.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
}
