import { ipConfig, nodeByIp, reach, resolveName, type LabState } from '../lab';

export interface ShellCtx {
  lab: LabState;
  node: string;
  operator: string;
  /** Called after any change to lab state, with a one-line description for the evidence trail. */
  changed: (what: string) => void;
}

export interface ShellResult {
  output: string;
}

export interface Shell {
  prompt(): string;
  exec(line: string): ShellResult;
  banner(): string;
}

export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** PowerShell-style -Param value lookup (case-insensitive, accepts prefixes like -Ident). */
export function param(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    const key = a.slice(1).toLowerCase();
    if (names.some((n) => n.toLowerCase() === key || (key.length >= 3 && n.toLowerCase().startsWith(key)))) {
      const v = args[i + 1];
      return v && !v.startsWith('-') ? v : '';
    }
  }
  return undefined;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.some((a) => a.toLowerCase() === `-${name.toLowerCase()}`);
}

/** First positional argument that is not a -Param or its value. */
export function positional(args: string[], index = 0): string | undefined {
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-')) {
      if (args[i + 1] && !args[i + 1].startsWith('-')) i++;
      continue;
    }
    pos.push(args[i]);
  }
  return pos[index];
}

export function pad(s: string | number, n: number): string {
  const t = String(s);
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

const rand = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export function pingOutput(ctx: ShellCtx, target: string, style: 'windows' | 'unix' | 'ios', count = 4): string {
  const { lab, node } = ctx;
  let ip = target;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    const r = resolveName(lab, node, target);
    if (!r.ok) {
      if (style === 'windows') return `Ping request could not find host ${target}. Please check the name and try again.`;
      if (style === 'ios') return `Translating "${target}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.`;
      return `ping: ${target}: Temporary failure in name resolution`;
    }
    ip = r.ip;
  }
  const res = reach(lab, node, ip, 0, 'icmp');
  const src = ipConfig(lab, node);
  const replies: string[] = [];
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const t = Math.max(1, Math.round(1 + rand(i + ip.length) * (ip.startsWith('10.20') || ip.startsWith('10.30') ? 38 : 3)));
    if (res.ok) {
      ok++;
      replies.push(style === 'windows' ? `Reply from ${ip}: bytes=32 time=${t}ms TTL=${ip.startsWith('10.') && ip.split('.')[2] === src.ip.split('.')[2] ? 128 : 127}` : `64 bytes from ${ip}: icmp_seq=${i + 1} ttl=63 time=${t}.${Math.floor(rand(i) * 9)} ms`);
    } else if (style === 'windows') {
      if (res.reason === 'no_ip') replies.push('PING: transmit failed. General failure.');
      else if (res.reason === 'no_route' && src.gw) replies.push(`Reply from ${src.ip}: Destination host unreachable.`);
      else replies.push('Request timed out.');
    }
  }
  if (style === 'windows') {
    return [`Pinging ${target}${ip !== target ? ` [${ip}]` : ''} with 32 bytes of data:`, ...replies, '', `Ping statistics for ${ip}:`, `    Packets: Sent = ${count}, Received = ${res.ok ? ok : res.reason === 'no_route' && src.gw ? count : 0}, Lost = ${res.ok ? 0 : res.reason === 'no_route' && src.gw ? 0 : count} (${res.ok ? 0 : res.reason === 'no_route' && src.gw ? 0 : 100}% loss),`].join('\n');
  }
  if (style === 'ios') {
    const marks = res.ok ? '!!!!!' : '.....';
    return `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:\n${marks}\nSuccess rate is ${res.ok ? 100 : 0} percent (${res.ok ? 5 : 0}/5)${res.ok ? ', round-trip min/avg/max = 1/2/4 ms' : ''}`;
  }
  return [`PING ${target} (${ip}) 56(84) bytes of data.`, ...replies, '', `--- ${target} ping statistics ---`, `${count} packets transmitted, ${ok} received, ${res.ok ? 0 : 100}% packet loss`].join('\n');
}

export function nslookupOutput(ctx: ShellCtx, name: string): string {
  const { lab, node } = ctx;
  const c = ipConfig(lab, node);
  const server = c.dns[0];
  if (!server) return "*** Can't find server address for '(null)': No response from server\nDNS request timed out.";
  const r = resolveName(lab, node, name);
  const serverName = nodeByIp(lab, server)?.toLowerCase();
  const head = `Server:  ${serverName ? `${serverName}.corp.salonemutual.lab` : 'UnKnown'}\nAddress:  ${server}\n`;
  if (!r.ok) {
    if (r.reason === 'nxdomain') return `${head}\n*** ${r.server} can't find ${name}: Non-existent domain`;
    return `DNS request timed out.\n    timeout was 2 seconds.\nServer:  UnKnown\nAddress:  ${server}\n\n*** Request to UnKnown timed-out`;
  }
  return `${head}\nName:    ${name.includes('.') ? name : `${name}.corp.salonemutual.lab`}\nAddress:  ${r.ip}`;
}

export function tracertOutput(ctx: ShellCtx, target: string): string {
  const { lab, node } = ctx;
  let ip = target;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    const r = resolveName(lab, node, target);
    if (!r.ok) return `Unable to resolve target system name ${target}.`;
    ip = r.ip;
  }
  const c = ipConfig(lab, node);
  const res = reach(lab, node, ip, 0, 'icmp');
  const lines = [`Tracing route to ${target} [${ip}]`, 'over a maximum of 30 hops:', ''];
  if (res.ok) {
    res.hops.forEach((h, i) => lines.push(`  ${i + 1}    <1 ms    <1 ms    <1 ms  ${h}`));
  } else if (res.reason === 'no_route' && c.gw) {
    lines.push(`  1  ${c.ip}  reports: Destination host unreachable.`);
  } else {
    for (let i = 1; i <= 4; i++) lines.push(`  ${i}     *        *        *     Request timed out.`);
  }
  lines.push('', 'Trace complete.');
  return lines.join('\n');
}

export function tcpTest(ctx: ShellCtx, target: string, port: number): { ok: boolean; ip: string | null; detail: string } {
  const { lab, node } = ctx;
  let ip = target;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(target)) {
    const r = resolveName(lab, node, target);
    if (!r.ok) return { ok: false, ip: null, detail: `Name resolution of ${target} failed` };
    ip = r.ip;
  }
  const res = reach(lab, node, ip, port, 'tcp');
  if (res.ok) return { ok: true, ip, detail: 'connected' };
  const why: Record<string, string> = {
    no_ip: 'no valid IP address on this host',
    no_route: 'no route to host (check the default gateway)',
    host_down: 'host unreachable',
    filtered: 'timed out (filtered)',
    refused: 'connection refused',
    link_down: 'network cable unplugged or port disabled',
  };
  return { ok: false, ip, detail: why[res.reason] };
}
