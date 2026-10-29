// IOS-style CLI for devices designed on the canvas (Packet Tracer's CLI tab), and a Windows-style
// command prompt for hosts. Commands read and change the lab document through the store, so a
// change typed here shows up on the canvas, in the inspector and in packet simulation at once.
import { modelOf } from './catalog';
import { runningConfig } from './config';
import { ciscoMac, ipToInt, isIp, maskToPrefix, prefixToMask } from './net';
import { bpduGuardOn, macsBehind, portSecurityState } from './l2features';
import { arpTable, cdpNeighbors, controlPlane, dhcpLease, macTable, poeUsage } from './protocols';
import { aclEntryText, isRouter, l3Ifaces, ping, primaryIp, traceroute } from './simulate';
import { useLab } from './store';
import type { Acl, AclEntry, Device, Iface, Route } from './types';
import { cableOnPort, cableStatus, deviceById } from './validate';

type Mode = 'user' | 'priv' | 'config' | 'if' | 'router' | 'vlan' | 'line' | 'dhcp' | 'acl';

const ABBR: [RegExp, string][] = [
  [/^(gigabitethernet|gig|gi|g)(\d.*)$/i, 'Gi$2'],
  [/^(tengigabitethernet|tengig|te|t)(\d.*)$/i, 'Te$2'],
  [/^(fastethernet|fa|f)(\d.*)$/i, 'FastEthernet$2'],
  [/^(serial|se|s)(\d.*)$/i, 'Se$2'],
  [/^(loopback|lo)(\d+)$/i, 'Loopback$2'],
  [/^(tunnel|tu)(\d+)$/i, 'Tunnel$2'],
  [/^(vlan|vl)(\d+)$/i, 'Vlan$2'],
  [/^(port-channel|po)(\d+)$/i, 'Port-channel$2'],
];

const dev = (id: string) => deviceById(useLab.getState().doc!, id);

function resolveIface(d: Device, raw: string): Iface | string {
  const t = raw.replace(/\s+/g, '');
  const exact = d.interfaces.find((i) => i.name.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  for (const [re, rep] of ABBR) {
    if (!re.test(t)) continue;
    const name = t.replace(re, rep);
    const hit = d.interfaces.find((i) => i.name.toLowerCase() === name.toLowerCase() || i.name.toLowerCase() === name.replace('FastEthernet', 'Fa').toLowerCase());
    if (hit) return hit;
    return name;
  }
  return t;
}

/** Expands "Gi0/1 - 4" or "g0/1-4" into interface names. */
function expandRange(d: Device, text: string): Iface[] | string {
  const out: Iface[] = [];
  for (const part of text.split(',')) {
    const m = /^\s*([a-z-]+)\s*([\d/]*?)(\d+)\s*-\s*(\d+)\s*$/i.exec(part);
    if (m) {
      for (let n = Number(m[3]); n <= Number(m[4]); n++) {
        const r = resolveIface(d, `${m[1]}${m[2]}${n}`);
        if (typeof r === 'string') return r;
        out.push(r);
      }
    } else {
      const r = resolveIface(d, part.trim());
      if (typeof r === 'string') return r;
      out.push(r);
    }
  }
  return out;
}

const wildcardToPrefix = (w: string) => {
  const n = ipToInt(w);
  return n === null ? null : maskToPrefix(prefixToMaskFromInverse(n));
};
function prefixToMaskFromInverse(n: number) {
  const m = ~n >>> 0;
  return [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join('.');
}

const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s + ' '.repeat(n - s.length));

const PORT_NAMES: Record<string, number> = { ftp: 21, 'ftp-data': 20, ssh: 22, telnet: 23, smtp: 25, domain: 53, bootps: 67, bootpc: 68, tftp: 69, www: 80, http: 80, pop3: 110, ntp: 123, snmp: 161, bgp: 179, https: 443, syslog: 514 };
const portNum = (t?: string) => (t === undefined ? NaN : PORT_NAMES[t.toLowerCase()] ?? Number(t));

/** Address spec: any | host A | A wildcard. Returns the spec and how many tokens it used. */
function aclAddr(t: string[], k: number): { spec: string; n: number } | null {
  if (t[k] === 'any') return { spec: 'any', n: 1 };
  if (t[k] === 'host' && isIp(t[k + 1])) return { spec: `host ${t[k + 1]}`, n: 2 };
  if (isIp(t[k]) && isIp(t[k + 1])) return { spec: `${t[k]} ${t[k + 1]}`, n: 2 };
  if (isIp(t[k])) return { spec: `host ${t[k]}`, n: 1 }; // standard ACL shorthand
  return null;
}

/** Parses "permit|deny ..." for a standard or extended ACL. */
export function parseAclEntry(type: Acl['type'], tokens: string[], seq: number): AclEntry | string {
  const t = tokens.map((x) => x.toLowerCase());
  if (t[0] === 'remark') return { seq, action: 'permit', proto: 'ip', src: 'any', dst: 'any', remark: tokens.slice(1).join(' ') };
  const action = t[0] === 'permit' || t[0] === 'deny' ? t[0] : null;
  if (!action) return '% Expected permit, deny or remark.';
  if (type === 'standard') {
    const a = aclAddr(t, 1);
    if (!a) return '% Standard ACL: permit|deny any | host <ip> | <ip> <wildcard>';
    return { seq, action, proto: 'ip', src: a.spec, dst: 'any' };
  }
  const proto = t[1] as AclEntry['proto'];
  if (!['ip', 'icmp', 'tcp', 'udp'].includes(proto)) return '% Extended ACL protocol must be ip, icmp, tcp or udp.';
  let k = 2;
  const src = aclAddr(t, k);
  if (!src) return '% Bad source: any | host <ip> | <ip> <wildcard>';
  k += src.n;
  if (['eq', 'lt', 'gt', 'neq'].includes(t[k])) k += 2; // source port: accepted, not used for matching
  else if (t[k] === 'range') k += 3;
  const dst = aclAddr(t, k);
  if (!dst) return '% Bad destination: any | host <ip> | <ip> <wildcard>';
  k += dst.n;
  let port: AclEntry['port'];
  if (['eq', 'lt', 'gt'].includes(t[k])) {
    const a = portNum(t[k + 1]);
    if (!Number.isFinite(a)) return `% Bad port ${t[k + 1] ?? ''}.`;
    if (proto !== 'tcp' && proto !== 'udp') return '% Ports need tcp or udp.';
    port = { op: t[k] as 'eq', a };
  } else if (t[k] === 'range') {
    const a = portNum(t[k + 1]);
    const b = portNum(t[k + 2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '% Bad port range.';
    port = { op: 'range', a, b };
  }
  return { seq, action, proto, src: src.spec, dst: dst.spec, port };
}

const numberedType = (n: number): Acl['type'] | null => ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999) ? 'standard' : (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699) ? 'extended' : null);

export class DesignCli {
  node: string;
  private mode: Mode = 'user';
  private ifs: string[] = [];
  private ospfPid = 1;
  private vlanId = 0;
  private pool = '';
  private aclName = '';
  private routerProto: 'ospf' | 'eigrp' = 'ospf';
  private eigrpAs = 1;
  constructor(private deviceId: string) {
    this.node = dev(deviceId)?.name ?? 'device';
  }
  private get d(): Device {
    return dev(this.deviceId)!;
  }
  private get host() {
    return modelOf(this.d).forwarding === 'host';
  }
  banner() {
    const d = this.d;
    const m = modelOf(d);
    if (this.host) return `Microsoft Windows [Version 10.0.22631]\r\n(lab designer command prompt for ${d.name})\r\nType help for the commands this lab understands.\r\n`;
    return `${m.vendor} ${m.name} (lab designer CLI) on ${d.name}\r\nPress RETURN to get started. Type ? for help.\r\n`;
  }
  prompt() {
    const n = this.d.name;
    if (this.host) return `C:\\Users\\aegis> `;
    return { user: `${n}>`, priv: `${n}#`, config: `${n}(config)#`, if: `${n}(config-if${this.ifs.length > 1 ? '-range' : ''})#`, router: `${n}(config-router)#`, vlan: `${n}(config-vlan)#`, line: `${n}(config-line)#`, dhcp: `${n}(dhcp-config)#`, acl: `${n}(config-${this.d.acls?.find((a) => a.name === this.aclName)?.type === 'standard' ? 'std' : 'ext'}-nacl)#` }[this.mode] + ' ';
  }

  exec(lineRaw: string): string {
    const line = lineRaw.trim();
    if (!line) return '';
    if (!this.d) return '% Device no longer exists.';
    try {
      return this.host ? this.hostCmd(line) : this.iosCmd(line);
    } catch (e) {
      return `% Error: ${(e as Error).message}`;
    }
  }

  // ---------------- host prompt ----------------
  private hostCmd(line: string): string {
    const [cmd, ...rest] = line.split(/\s+/);
    const c = cmd.toLowerCase();
    const d = this.d;
    const nic = d.interfaces.find((i) => i.type === 'copper' || i.type === 'virtual' || i.type === 'wireless');
    if (c === 'help' || c === '?') return 'ipconfig [/all | /renew | /release]   ping <ip|name> [-n count]   tracert <ip|name>   arp -a   hostname\r\nnetsh interface ip set address "<nic>" static <ip> <mask> <gateway>   netsh interface ip set address "<nic>" dhcp';
    if (c === 'hostname') return d.name;
    if (c === 'ipconfig') {
      const sw = (rest[0] ?? '').toLowerCase();
      if (sw === '/renew') return this.renew(nic);
      if (sw === '/release') {
        if (!nic) return 'No adapter.';
        useLab.getState().updateIface(d.id, nic.name, { ip: undefined, prefix: undefined, gateway: undefined });
        return `Ethernet adapter ${nic.name}: address released.`;
      }
      return runningConfig(this.d).replace(/\n/g, '\r\n');
    }
    if (c === 'arp' && rest[0] === '-a') {
      const t = arpTable(useLab.getState().doc!, d.id);
      return t.length ? `Interface: ${primaryIp(d)}\r\n  Internet Address      Physical Address      Type\r\n${t.map((e) => `  ${pad(e.ip, 22)}${pad(e.mac.replace(/:/g, '-'), 22)}dynamic`).join('\r\n')}` : 'No ARP Entries Found.';
    }
    if (c === 'ping') return this.pingCmd(rest, true);
    if (c === 'tracert' || c === 'traceroute') return this.traceCmd(rest[0], true);
    if (c === 'netsh') {
      const m = /set address\s+(?:name=)?"?([^"\s]+)"?\s+(static|dhcp|source=dhcp)\s*(\S+)?\s*(\S+)?\s*(\S+)?/i.exec(line);
      if (!m) return 'The syntax supplied for this command is not valid.';
      const target = d.interfaces.find((i) => i.name.toLowerCase() === m[1].toLowerCase());
      if (!target) return `The interface "${m[1]}" was not found. Try "${nic?.name}".`;
      if (/dhcp/i.test(m[2])) {
        useLab.getState().updateIface(d.id, target.name, { dhcp: true });
        return this.renew(dev(d.id)!.interfaces.find((i) => i.name === target.name));
      }
      if (!isIp(m[3]) || !isIp(m[4])) return 'The syntax supplied for this command is not valid.';
      const prefix = maskToPrefix(m[4]);
      if (prefix === null) return `${m[4]} is not a valid subnet mask.`;
      useLab.getState().updateIface(d.id, target.name, { ip: m[3], prefix, gateway: m[5] && isIp(m[5]) ? m[5] : undefined, dhcp: false });
      return 'Ok.';
    }
    return `'${cmd}' is not recognized as an internal or external command. Type help.`;
  }

  private renew(nic: Iface | undefined): string {
    if (!nic) return 'No adapter.';
    const r = useLab.getState().renewDhcp(this.deviceId, nic.name);
    if (!r.ok) return `An error occurred while renewing interface ${nic.name}: unable to contact your DHCP server.\r\n(AEGIS) ${r.reason}${r.fix ? `\r\nFix: ${r.fix}` : ''}`;
    return `Ethernet adapter ${nic.name}:\r\n   IPv4 Address. . . . . . . . . . . : ${r.ip}\r\n   Subnet Mask . . . . . . . . . . . : ${prefixToMask(r.prefix!)}\r\n   Default Gateway . . . . . . . . . : ${r.gateway ?? ''}\r\n   DHCP Server . . . . . . . . . . . : ${r.server}${r.via ? ` via relay ${r.via}` : ''}`;
  }

  private resolveTarget(t: string | undefined): string | null {
    if (!t) return null;
    if (isIp(t)) return t;
    const doc = useLab.getState().doc!;
    const d = doc.devices.find((x) => x.name.toLowerCase() === String(t).toLowerCase());
    return d ? primaryIp(d) ?? null : null;
  }

  private pingCmd(args: string[], windows: boolean): string {
    const target = this.resolveTarget(args[0]);
    if (!target) return windows ? `Ping request could not find host ${args[0] ?? ''}.` : '% Unrecognized host or address.';
    const nIdx = args.findIndex((a) => a === '-n' || a === 'repeat');
    const count = Math.min(10, Math.max(1, nIdx >= 0 ? Number(args[nIdx + 1]) || 4 : windows ? 4 : 5));
    const traces = ping(useLab.getState().doc!, this.deviceId, target, count);
    useLab.getState().addTrace(traces);
    const ok = traces.filter((t) => t.status === 'delivered' || t.status === 'delayed');
    const times = ok.map((t) => Math.max(1, Math.round(t.latencyMs ?? 1)));
    const fail = traces.find((t) => t.status !== 'delivered' && t.status !== 'delayed');
    if (windows) {
      const lines = traces.map((t) => (t.status === 'delivered' || t.status === 'delayed' ? `Reply from ${target}: bytes=32 time=${Math.max(1, Math.round(t.latencyMs ?? 1))}ms TTL=${t.hops.at(-1)?.pdu.ttl ?? 128}` : t.status === 'blocked' ? 'Request timed out.' : t.status === 'malformed' ? 'Request timed out.' : t.reason.startsWith('ARP') || t.reason.includes('no route') ? `Reply from ${primaryIp(this.d)}: Destination host unreachable.` : 'Request timed out.'));
      return [`Pinging ${target} with 32 bytes of data:`, ...lines, '', `Ping statistics for ${target}:`, `    Packets: Sent = ${count}, Received = ${ok.length}, Lost = ${count - ok.length} (${Math.round(((count - ok.length) / count) * 100)}% loss),`, ...(times.length ? [`Approximate round trip times in milli-seconds:`, `    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms`] : []), ...(fail ? ['', `(AEGIS) ${fail.reason}`] : [])].join('\r\n');
    }
    const marks = traces.map((t) => (t.status === 'delivered' || t.status === 'delayed' ? '!' : t.status === 'blocked' ? 'U' : '.')).join('');
    return [`Type escape sequence to abort.`, `Sending ${count}, 100-byte ICMP Echos to ${target}, timeout is 2 seconds:`, marks, `Success rate is ${Math.round((ok.length / count) * 100)} percent (${ok.length}/${count})${times.length ? `, round-trip min/avg/max = ${Math.min(...times)}/${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}/${Math.max(...times)} ms` : ''}`, ...(fail ? [`% AEGIS: ${fail.reason}`] : [])].join('\r\n');
  }

  private traceCmd(t: string | undefined, windows: boolean): string {
    const target = this.resolveTarget(t);
    if (!target) return windows ? `Unable to resolve target system name ${t ?? ''}.` : '% Unrecognized host or address.';
    const r = traceroute(useLab.getState().doc!, this.deviceId, target);
    useLab.getState().addTrace([r.trace]);
    const lines = r.hops.map((h) => (windows ? `  ${h.n}    ${h.ip === '*' ? '*        *        *     Request timed out.' : `${h.ms} ms   ${h.ms} ms   ${h.ms} ms  ${h.ip} [${h.name}]`}` : ` ${h.n} ${h.ip === '*' ? '* * *' : `${h.ip} ${h.ms} msec ${h.ms} msec ${h.ms} msec`}`));
    const head = windows ? `Tracing route to ${target} over a maximum of 30 hops\r\n` : `Type escape sequence to abort.\r\nTracing the route to ${target}\r\n`;
    const tail = r.trace.status === 'delivered' || r.trace.status === 'delayed' ? (windows ? '\r\nTrace complete.' : '') : `\r\n% AEGIS: ${r.trace.reason}`;
    return head + lines.join('\r\n') + tail;
  }

  // ---------------- IOS ----------------
  private iosCmd(line: string): string {
    const st = useLab.getState();
    const lower = line.toLowerCase();
    const words = lower.split(/\s+/);
    const raw = line.split(/\s+/);
    const is = (...prefixes: string[]) => prefixes.every((p, k) => words[k] !== undefined && p.startsWith(words[k]));
    if (words[0] === 'do' && this.mode !== 'user' && this.mode !== 'priv') return this.privCmd(raw.slice(1).join(' '));
    if (line === '?' || words[0] === 'help') return this.help();
    if (is('end') || line === '\u001a') {
      this.mode = this.mode === 'user' ? 'user' : 'priv';
      return '';
    }
    if (is('exit') || is('quit')) {
      this.mode = this.mode === 'if' || this.mode === 'router' || this.mode === 'vlan' || this.mode === 'line' || this.mode === 'dhcp' || this.mode === 'acl' ? 'config' : this.mode === 'config' ? 'priv' : 'user';
      return '';
    }
    if (this.mode === 'user') {
      if (is('enable') || is('en')) {
        this.mode = 'priv';
        return '';
      }
      if (words[0] && ('show'.startsWith(words[0]) || 'ping'.startsWith(words[0]) || 'traceroute'.startsWith(words[0]))) return this.privCmd(line);
      return '% Type "enable" for privileged EXEC mode.';
    }
    if (this.mode === 'priv') {
      if (is('configure', 'terminal') || is('conf', 't') || lower === 'conf t') {
        this.mode = 'config';
        return 'Enter configuration commands, one per line.  End with CNTL/Z.';
      }
      if (is('disable')) {
        this.mode = 'user';
        return '';
      }
      return this.privCmd(line);
    }
    // ---- configuration modes ----
    const d = this.d;
    const neg = words[0] === 'no';
    const w = neg ? words.slice(1) : words;
    const r = neg ? raw.slice(1) : raw;
    const has = (...p: string[]) => p.every((x, k) => w[k] !== undefined && x.startsWith(w[k]));
    if (has('interface')) {
      const rangeMode = has('interface', 'range');
      const spec = r.slice(rangeMode ? 2 : 1).join(' ');
      const list = rangeMode ? expandRange(d, spec) : expandRange(d, spec.replace(/\s+/g, ''));
      if (typeof list === 'string') {
        // creating a logical interface
        const m = /^(Loopback|Tunnel|Vlan)(\d+)$/i.exec(list) ?? /^(Gi[\d/]+|igb\d+|Se[\d/]+)\.(\d+)$/i.exec(list);
        if (!m) return `% Invalid input: ${d.name} has no interface ${list}.`;
        const sub = list.includes('.');
        const parent = sub ? list.split('.')[0] : undefined;
        if (sub && !d.interfaces.some((i) => i.name === parent)) return `% Invalid input: no parent ${parent}.`;
        st.addIface(d.id, { name: list, type: 'virtual', speeds: [1000], speed: 'auto', duplex: 'auto', mac: d.interfaces.find((i) => i.mac)?.mac ?? '', shutdown: false, mode: 'routed', ...(sub ? { parent, vlan: Number(m[2]) } : {}), ...(/^vlan/i.test(list) ? { vlan: Number(m[2]) } : {}) });
        this.ifs = [list];
      } else this.ifs = list.map((i) => i.name);
      this.mode = 'if';
      return '';
    }
    if (this.mode === 'config') return this.configCmd(line, w, r, neg, has);
    if (this.mode === 'if') return this.ifCmd(w, r, neg, has);
    if (this.mode === 'router') return this.routerProto === 'eigrp' ? this.eigrpCmd(w, r, neg, has) : this.routerCmd(w, r, neg, has);
    if (this.mode === 'acl') return this.aclCmd(raw, neg, has);
    if (this.mode === 'vlan') {
      if (has('name')) {
        st.setVlans(d.id, { ...d.vlans, [this.vlanId]: r.slice(1).join('_') });
        return '';
      }
      return '% Invalid input in vlan mode (use name <NAME> or exit).';
    }
    if (this.mode === 'line') {
      if (has('transport', 'input')) {
        const v = w[2] ?? 'all';
        st.updateDevice(d.id, { security: { ...this.sec(), ssh: v.startsWith('s') || v === 'all' ? this.sec().ssh || v === 'ssh' : false, telnet: v.startsWith('t') || v === 'all' } });
        return '';
      }
      if (has('login') || has('password') || has('exec-timeout') || has('logging')) return '';
      return '% Invalid input in line mode.';
    }
    if (this.mode === 'dhcp') {
      const pools = [...(d.dhcpPools ?? [])];
      const p = pools.find((x) => x.name === this.pool);
      if (!p) return '% Pool gone.';
      if (has('network') && isIp(r[1]) && isIp(r[2])) {
        const prefix = maskToPrefix(r[2]) ?? 24;
        const base = ipToInt(r[1])!;
        const size = 2 ** (32 - prefix);
        Object.assign(p, { network: `${r[1]}/${prefix}`, start: p.start || intToIpLocal(base + 10), end: p.end || intToIpLocal(base + size - 2) });
      } else if (has('default-router') && isIp(r[1])) p.gateway = r[1];
      else if (has('dns-server')) p.dns = r.slice(1).filter(isIp);
      else return '% Invalid input in dhcp-config mode (network, default-router, dns-server).';
      st.updateDevice(d.id, { dhcpPools: pools });
      return '';
    }
    return '% Invalid input detected.';
  }

  private sec() {
    return this.d.security ?? { ssh: false, telnet: true, enableSecret: false };
  }

  private configCmd(line: string, w: string[], r: string[], neg: boolean, has: (...p: string[]) => boolean): string {
    const st = useLab.getState();
    const d = this.d;
    if (has('hostname')) {
      const name = r[1];
      if (!name) return '% Incomplete command.';
      st.updateDevice(d.id, { name });
      this.node = name;
      return '';
    }
    if (has('vlan')) {
      const id = Number(w[1]);
      if (!Number.isInteger(id) || id < 1 || id > 4094) return '% Bad VLAN list.';
      if (d.vtp?.mode === 'client') return 'VTP VLAN configuration not allowed when device is in CLIENT mode.';
      const next = { ...d.vlans };
      if (neg) {
        delete next[id];
        st.setVlans(d.id, next);
        return '';
      }
      if (!next[id]) next[id] = `VLAN${String(id).padStart(4, '0')}`;
      st.setVlans(d.id, next);
      this.vlanId = id;
      this.mode = 'vlan';
      return '';
    }
    if (has('ip', 'route')) {
      const [net, mask, via] = r.slice(2);
      if (!isIp(net) || !isIp(mask)) return '% Invalid input: ip route <network> <mask> <next-hop|interface>.';
      const prefix = maskToPrefix(mask);
      if (prefix === null) return '% Inconsistent address and mask.';
      const p = `${net}/${prefix}`;
      const viaIp = isIp(via) ? via : undefined;
      const viaIf = !viaIp && via ? resolveIface(d, via) : undefined;
      const others = d.routes.filter((x) => !(x.prefix === p && x.kind !== 'connected' && (!via || x.via === viaIp || x.iface === (typeof viaIf === 'string' ? viaIf : viaIf?.name))));
      if (neg) st.setRoutes(d.id, others);
      else {
        if (!viaIp && !viaIf) return '% Incomplete command.';
        st.setRoutes(d.id, [...others, { prefix: p, via: viaIp, iface: typeof viaIf === 'object' ? viaIf.name : undefined, kind: p === '0.0.0.0/0' ? 'default' : 'static' } as Route]);
      }
      return '';
    }
    if (has('ip', 'default-gateway')) {
      const gw = r[2];
      if (!neg && !isIp(gw)) return '% Invalid address.';
      st.setRoutes(d.id, [...d.routes.filter((x) => x.prefix !== '0.0.0.0/0'), ...(neg ? [] : [{ prefix: '0.0.0.0/0', via: gw, kind: 'default' as const, description: 'ip default-gateway' }])]);
      return '';
    }
    if (has('router', 'ospf')) {
      this.ospfPid = Number(w[2]) || 1;
      if (neg) {
        for (const i of d.interfaces) if (i.ospf) st.updateIface(d.id, i.name, { ospf: undefined });
        st.updateDevice(d.id, { ospfProcess: undefined });
        return '';
      }
      if (!this.d.ospfProcess) st.updateDevice(d.id, { ospfProcess: {} });
      this.routerProto = 'ospf';
      this.mode = 'router';
      return '';
    }
    if (has('spanning-tree', 'mode')) {
      const mode = w[2]?.startsWith('r') ? 'rapid-pvst' : w[2]?.startsWith('m') ? 'mst' : 'pvst';
      st.updateDevice(d.id, { stp: { enabled: true, priority: d.stp?.priority ?? 32768, ...d.stp, mode } });
      return '';
    }
    if (has('spanning-tree', 'portfast', 'bpduguard')) {
      st.updateDevice(d.id, { stp: { enabled: d.stp?.enabled ?? true, priority: d.stp?.priority ?? 32768, ...d.stp, bpduGuardDefault: !neg } });
      return '';
    }
    if (has('spanning-tree', 'portfast', 'default') || (has('spanning-tree', 'portfast') && w.length === 2)) {
      for (const i of d.interfaces.filter((x) => (x.mode ?? 'access') === 'access' && x.type !== 'console' && !/^vlan/i.test(x.name))) st.updateIface(d.id, i.name, { portfast: !neg });
      return neg ? '' : '%Warning: this command enables portfast by default on all interfaces. You should now disable portfast explicitly on switched ports leading to hubs, switches and bridges as they may create temporary bridging loops.';
    }
    if (has('spanning-tree', 'vlan')) {
      const pri = Number(w[w.indexOf('priority') + 1]);
      if (neg) {
        st.updateDevice(d.id, { stp: { enabled: false, priority: d.stp?.priority ?? 32768 } });
        return '';
      }
      if (w.includes('priority')) {
        if (!Number.isInteger(pri) || pri % 4096 !== 0 || pri > 61440) return '% Bridge Priority must be in increments of 4096. Allowed values are: 0 4096 8192 ... 61440';
        st.updateDevice(d.id, { stp: { enabled: true, priority: pri } });
        return '';
      }
      if (w.includes('root')) {
        st.updateDevice(d.id, { stp: { enabled: true, priority: w.includes('primary') ? 24576 : 28672 } });
        return '';
      }
      return '';
    }
    if (has('spanning-tree')) {
      if (neg) st.updateDevice(d.id, { stp: { enabled: false, priority: d.stp?.priority ?? 32768 } });
      else st.updateDevice(d.id, { stp: { enabled: true, priority: d.stp?.priority ?? 32768 } });
      return '';
    }
    if (has('ip', 'nat', 'inside', 'source') && !w.includes('static')) {
      const ifIdx = w.indexOf('interface');
      if (neg) {
        st.updateDevice(d.id, { natOverload: undefined });
        return '';
      }
      if (ifIdx < 0 || !w.includes('overload')) return '% AEGIS lab supports: ip nat inside source list <acl> interface <outside-if> overload';
      const out = resolveIface(d, r[ifIdx + 1] ?? '');
      if (typeof out === 'string') return `% No interface ${out}.`;
      st.updateDevice(d.id, { natOverload: { outside: out.name } });
      return '';
    }
    if (has('ip', 'routing')) {
      if (d.kind !== 'switch') return neg ? '% AEGIS: routers always route.' : '';
      st.updateDevice(d.id, { ipRouting: !neg });
      return '';
    }
    if (has('access-list')) {
      const num = Number(w[1]);
      const type = numberedType(num);
      if (!type) return '% Invalid access list number (1-99, 1300-1999 standard; 100-199, 2000-2699 extended).';
      const name = String(num);
      const acls = [...(d.acls ?? [])];
      if (neg && w.length === 2) {
        st.updateDevice(d.id, { acls: acls.filter((a) => a.name !== name) });
        return '';
      }
      const acl = acls.find((a) => a.name === name) ?? { name, type, entries: [] };
      const seq = (acl.entries.at(-1)?.seq ?? 0) + 10;
      const e = parseAclEntry(type, r.slice(2), seq);
      if (typeof e === 'string') return e;
      st.updateDevice(d.id, { acls: [...acls.filter((a) => a.name !== name), { ...acl, entries: [...acl.entries, e] }] });
      return '';
    }
    if (has('ip', 'access-list')) {
      const type = w[2]?.startsWith('s') ? 'standard' : w[2]?.startsWith('e') ? 'extended' : null;
      const name = r[3];
      if (!type || !name) return '% ip access-list standard|extended <name>';
      const acls = d.acls ?? [];
      if (neg) {
        st.updateDevice(d.id, { acls: acls.filter((a) => a.name !== name) });
        return '';
      }
      if (!acls.some((a) => a.name === name)) st.updateDevice(d.id, { acls: [...acls, { name, type, entries: [] }] });
      this.aclName = name;
      this.mode = 'acl';
      return '';
    }
    if (has('vtp')) {
      const vtp = { mode: 'server' as const, domain: '', revision: 0, ...d.vtp };
      if (d.kind !== 'switch') return '% VTP is a switch feature.';
      if (has('vtp', 'mode')) {
        const m = w[2]?.startsWith('se') ? 'server' : w[2]?.startsWith('c') ? 'client' : w[2]?.startsWith('t') ? 'transparent' : w[2]?.startsWith('o') ? 'off' : null;
        if (!m) return '% vtp mode server|client|transparent|off';
        st.updateDevice(d.id, { vtp: { ...vtp, mode: m, revision: m === 'transparent' || m === 'off' ? 0 : vtp.revision } });
        return `Setting device to VTP ${m.toUpperCase()} mode for VLANS.`;
      }
      if (has('vtp', 'domain')) {
        st.updateDevice(d.id, { vtp: { ...vtp, domain: r[2] ?? '' } });
        return `Changing VTP domain name from ${vtp.domain || 'NULL'} to ${r[2]}`;
      }
      if (has('vtp', 'password')) {
        st.updateDevice(d.id, { vtp: { ...vtp, password: neg ? undefined : r[2] } });
        return `Setting device VTP password to ${r[2] ?? ''}`;
      }
      if (has('vtp', 'version')) {
        st.updateDevice(d.id, { vtp: { ...vtp, version: (Number(w[2]) || 2) as 1 | 2 | 3 } });
        return '';
      }
      return '% vtp mode|domain|password|version';
    }
    if (has('ip', 'dhcp', 'snooping')) {
      const cur = d.dhcpSnooping ?? { enabled: false, vlans: [] };
      if (has('ip', 'dhcp', 'snooping', 'vlan')) {
        const vl = (w[4] ?? '').split(',').flatMap((x) => (x.includes('-') ? Array.from({ length: Number(x.split('-')[1]) - Number(x.split('-')[0]) + 1 }, (_, k) => Number(x.split('-')[0]) + k) : [Number(x)])).filter(Number.isFinite);
        st.updateDevice(d.id, { dhcpSnooping: { ...cur, vlans: neg ? cur.vlans.filter((v) => !vl.includes(v)) : [...new Set([...cur.vlans, ...vl])].sort((a, b) => a - b) } });
        return '';
      }
      if (has('ip', 'dhcp', 'snooping', 'information') || has('ip', 'dhcp', 'snooping', 'database')) return '';
      st.updateDevice(d.id, { dhcpSnooping: { ...cur, enabled: !neg } });
      return '';
    }
    if (has('ip', 'arp', 'inspection', 'vlan')) {
      const vl = (w[4] ?? '').split(',').map(Number).filter(Number.isFinite);
      const cur = d.dai?.vlans ?? [];
      st.updateDevice(d.id, { dai: { vlans: neg ? cur.filter((v) => !vl.includes(v)) : [...new Set([...cur, ...vl])].sort((a, b) => a - b) } });
      return d.dhcpSnooping?.enabled ? '' : '% AEGIS: DAI checks ARP against the DHCP snooping binding table; enable ip dhcp snooping too.';
    }
    if (has('monitor', 'session')) {
      const n = Number(w[2]);
      const sessions = [...(d.span ?? [])];
      const cur = sessions.find((x) => x.session === n) ?? { session: n, sources: [], dest: '' };
      if (neg) {
        st.updateDevice(d.id, { span: sessions.filter((x) => x.session !== n) });
        return '';
      }
      const ifName = r.slice(5).filter((x) => !['both', 'rx', 'tx'].includes(x.toLowerCase())).join('');
      const i = resolveIface(d, ifName);
      if (typeof i === 'string') return `% No interface ${i}.`;
      if (w[3]?.startsWith('so')) cur.sources = [...new Set([...cur.sources, i.name])];
      else if (w[3]?.startsWith('d')) cur.dest = i.name;
      else return '% monitor session <n> source|destination interface <if>';
      st.updateDevice(d.id, { span: [...sessions.filter((x) => x.session !== n), cur] });
      return '';
    }
    if (has('ip', 'nat', 'inside', 'source', 'static')) {
      const [inside, outside] = r.slice(5);
      const list = d.staticNat ?? [];
      if (!isIp(inside) || !isIp(outside)) return '% ip nat inside source static <inside-local> <inside-global>';
      st.updateDevice(d.id, { staticNat: neg ? list.filter((x) => x.inside !== inside) : [...list.filter((x) => x.inside !== inside), { inside, outside }] });
      return '';
    }
    if (has('router', 'eigrp')) {
      const as = Number(w[2]);
      if (!Number.isInteger(as) || as < 1) return '% router eigrp <autonomous-system 1-65535>';
      if (neg) {
        for (const i of d.interfaces) if (i.eigrp?.as === as) st.updateIface(d.id, i.name, { eigrp: undefined });
        st.updateDevice(d.id, { eigrpProcess: undefined });
        return '';
      }
      st.updateDevice(d.id, { eigrpProcess: { ...(d.eigrpProcess ?? {}), as } });
      this.eigrpAs = as;
      this.routerProto = 'eigrp';
      this.mode = 'router';
      return '';
    }
    if (has('errdisable')) return '';
    if (has('service') || has('ip', 'domain-name') || has('no', 'ip', 'domain-lookup') || has('ip', 'dhcp', 'excluded-address') || has('logging') || has('ntp') || has('snmp-server') || has('username')) return '';
    if (has('enable', 'secret') || has('enable', 'password')) {
      st.updateDevice(d.id, { security: { ...this.sec(), enableSecret: !neg } });
      return '';
    }
    if (has('banner', 'motd')) {
      const text = line.replace(/^\s*banner\s+motd\s+/i, '').replace(/^(.)(.*)\1$/, '$2');
      st.updateDevice(d.id, { security: { ...this.sec(), banner: neg ? undefined : text } });
      return '';
    }
    if (has('ip', 'ssh') || has('crypto', 'key', 'generate')) {
      st.updateDevice(d.id, { security: { ...this.sec(), ssh: !neg } });
      return has('crypto') ? 'The name for the keys will be: ' + d.name + '.lab\r\n% Generating 2048 bit RSA keys, keys will be non-exportable...[OK]' : '';
    }
    if (has('line', 'vty') || has('line', 'console') || has('line', 'con')) {
      this.mode = 'line';
      return '';
    }
    if (has('ip', 'dhcp', 'pool')) {
      const name = r[3];
      if (!name) return '% Incomplete command.';
      const pools = (d.dhcpPools ?? []).filter((p) => p.name !== name);
      if (neg) {
        st.updateDevice(d.id, { dhcpPools: pools });
        return '';
      }
      const existing = d.dhcpPools?.find((p) => p.name === name);
      st.updateDevice(d.id, { dhcpPools: [...pools, existing ?? { name, network: '', start: '', end: '' }] });
      this.pool = name;
      this.mode = 'dhcp';
      return '';
    }
    return `% Invalid input detected at '^' marker: "${line}". Type ? for what this lab supports.`;
  }

  private ifCmd(w: string[], r: string[], neg: boolean, has: (...p: string[]) => boolean): string {
    const st = useLab.getState();
    const out: string[] = [];
    for (const name of this.ifs) {
      const d = this.d;
      const i = d.interfaces.find((x) => x.name === name);
      if (!i) return `% ${name} no longer exists.`;
      const set = (p: Partial<Iface>) => st.updateIface(d.id, name, p);
      if (has('shutdown')) {
        if (!neg && i.errDisabled) out.push(`%LINK-5-CHANGED: Interface ${name}, changed state to administratively down (err-disable cleared)`);
        set({ shutdown: !neg });
      }
      else if (has('description')) set({ description: neg ? undefined : r.slice(1).join(' ') });
      else if (has('ip', 'address')) {
        if (neg) set({ ip: undefined, prefix: undefined, dhcp: false });
        else if (w[2] === 'dhcp') {
          set({ dhcp: true });
          const res = st.renewDhcp(d.id, name);
          out.push(res.ok ? `%DHCP-6-ADDRESS_ASSIGN: Interface ${name} assigned DHCP address ${res.ip}, mask ${prefixToMask(res.prefix!)}` : `% DHCP failed: ${res.reason}`);
        } else {
          if (!isIp(r[2]) || !isIp(r[3])) return '% Invalid input: ip address <address> <mask>';
          const prefix = maskToPrefix(r[3]);
          if (prefix === null) return '% Bad mask.';
          const dup = useLab.getState().doc!.devices.flatMap((x) => x.interfaces.filter((y) => y.ip === r[2] && !(x.id === d.id && y.name === name)).map((y) => `${x.name} ${y.name}`));
          if (dup.length) out.push(`% ${r[2]} overlaps with ${dup[0]} (duplicate address)`);
          set({ ip: r[2], prefix, dhcp: false });
        }
      } else if (has('switchport', 'mode')) {
        if (d.kind !== 'switch') return '% Command rejected: not a switch port.';
        if (w[2]?.startsWith('d')) {
          const dtp = w[3]?.startsWith('d') ? 'desirable' : 'auto';
          if (i.portSecurity?.enabled) return `% Command rejected: port security is enabled on ${name}; a secure port cannot be dynamic.`;
          set({ dtp, nonegotiate: false });
        } else set(w[2]?.startsWith('t') ? { mode: 'trunk', dtp: undefined, allowedVlans: i.allowedVlans ?? 'all', nativeVlan: i.nativeVlan ?? 1 } : { mode: 'access', dtp: undefined, vlan: i.vlan ?? 1 });
      } else if (has('switchport', 'nonegotiate')) {
        if (i.dtp) return '% Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.';
        set({ nonegotiate: !neg });
      } else if (has('switchport', 'port-security')) {
        if (d.kind !== 'switch') return '% Command rejected: not a switch port.';
        if (i.dtp) return `% Command rejected: ${name} is a dynamic port.`;
        const ps = i.portSecurity ?? { enabled: false, max: 1, sticky: false, violation: 'shutdown' as const, macs: [] };
        if (has('switchport', 'port-security', 'maximum')) set({ portSecurity: { ...ps, max: neg ? 1 : Math.max(1, Number(w[3]) || 1) } });
        else if (has('switchport', 'port-security', 'violation')) {
          const v = neg ? 'shutdown' : w[3]?.startsWith('r') ? 'restrict' : w[3]?.startsWith('p') ? 'protect' : w[3]?.startsWith('s') ? 'shutdown' : null;
          if (!v) return '% violation protect|restrict|shutdown';
          set({ portSecurity: { ...ps, violation: v } });
        } else if (has('switchport', 'port-security', 'mac-address')) {
          if (w[3]?.startsWith('st')) set({ portSecurity: { ...ps, sticky: !neg, macs: neg ? [] : ps.macs } });
          else {
            const mac = (w[3] ?? '').replace(/\./g, '').replace(/(..)(?=.)/g, '$1:').toLowerCase();
            if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac)) return '% Bad MAC address (use H.H.H).';
            set({ portSecurity: { ...ps, macs: neg ? ps.macs.filter((m) => m !== mac) : [...new Set([...ps.macs, mac])] } });
          }
        } else if ((i.mode ?? 'access') !== 'access' && i.mode !== 'trunk') return `% Command rejected: ${name} is not an access or trunk port.`;
        else set({ portSecurity: neg ? undefined : { ...ps, enabled: true } });
      } else if (has('switchport') && w.length === 1) {
        if (d.kind !== 'switch') return '% Command rejected: not a switch.';
        set(neg ? { mode: 'routed' } : { mode: 'access', vlan: i.vlan ?? 1, ip: undefined, prefix: undefined });
        if (neg && !d.ipRouting) out.push('% AEGIS: routed port configured; enable ip routing on the switch to route between it and the SVIs.');
      } else if (has('switchport', 'access', 'vlan')) {
        const v = neg ? 1 : Number(w[3]);
        if (!Number.isInteger(v)) return '% Bad VLAN.';
        if (!d.vlans[v] && v !== 1) {
          st.setVlans(d.id, { ...d.vlans, [v]: `VLAN${String(v).padStart(4, '0')}` });
          out.push(`% Access VLAN does not exist. Creating vlan ${v}`);
        }
        set({ vlan: v });
      } else if (has('switchport', 'trunk', 'native', 'vlan')) set({ nativeVlan: neg ? 1 : Number(w[4]) });
      else if (has('switchport', 'trunk', 'allowed', 'vlan')) {
        const spec = w.slice(4);
        const cur = i.allowedVlans === undefined || i.allowedVlans === 'all' ? null : [...i.allowedVlans];
        const parse = (s: string) => s.split(',').flatMap((x) => (x.includes('-') ? Array.from({ length: Number(x.split('-')[1]) - Number(x.split('-')[0]) + 1 }, (_, k) => Number(x.split('-')[0]) + k) : [Number(x)])).filter(Number.isFinite);
        if (spec[0] === 'all' || neg) set({ allowedVlans: 'all' });
        else if (spec[0] === 'add') set({ allowedVlans: [...new Set([...(cur ?? []), ...parse(spec[1] ?? '')])].sort((a, b) => a - b) });
        else if (spec[0] === 'remove') set({ allowedVlans: (cur ?? Array.from({ length: 4094 }, (_, k) => k + 1)).filter((v) => !parse(spec[1] ?? '').includes(v)) });
        else if (spec[0] === 'none') set({ allowedVlans: [] });
        else set({ allowedVlans: parse(spec[0] ?? '') });
      } else if (has('switchport')) {
        /* switchport, switchport nonegotiate */
      } else if (has('speed')) {
        const v = neg || w[1] === 'auto' ? 'auto' : Number(w[1]);
        if (v !== 'auto' && !i.speeds.includes(v as never)) return `% ${name} does not support speed ${w[1]}.`;
        set({ speed: v as Iface['speed'] });
      } else if (has('duplex')) set({ duplex: neg ? 'auto' : (w[1]?.startsWith('f') ? 'full' : w[1]?.startsWith('h') ? 'half' : 'auto') });
      else if (has('channel-group')) {
        if (neg) set({ channelGroup: undefined, channelMode: undefined });
        else {
          const g = Number(w[1]);
          const mode = (w[3] ?? 'on') as Iface['channelMode'];
          if (!Number.isInteger(g)) return '% Bad channel-group number.';
          if (!['active', 'passive', 'on', 'desirable', 'auto'].includes(mode!)) return '% Invalid mode (active, passive, on, desirable, auto).';
          set({ channelGroup: g, channelMode: mode });
          out.push(`Creating a port-channel interface Port-channel ${g}`);
        }
      } else if (has('standby')) {
        const g = Number(w[1]);
        const h = i.hsrp ?? { group: g, vip: '', priority: 100, preempt: false };
        if (neg) set({ hsrp: undefined });
        else if (w[2] === 'ip' && isIp(r[3])) set({ hsrp: { ...h, group: g, vip: r[3], proto: 'hsrp' } });
        else if (w[2]?.startsWith('pri')) set({ hsrp: { ...h, group: g, priority: Number(w[3]) || 100, proto: 'hsrp' } });
        else if (w[2]?.startsWith('pre')) set({ hsrp: { ...h, group: g, preempt: true, proto: 'hsrp' } });
        else if (w[2]?.startsWith('ver') || w[2]?.startsWith('auth') || w[2]?.startsWith('track')) {
          /* accepted */
        } else return '% standby <group> ip <vip> | priority <n> | preempt';
      } else if (has('ip', 'nat')) set({ nat: neg ? undefined : w[2]?.startsWith('in') ? 'inside' : 'outside' });
      else if (has('ip', 'helper-address')) set({ helper: neg ? undefined : r[2] });
      else if (has('ip', 'ospf', 'cost')) set({ ospf: i.ospf ? { ...i.ospf, cost: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf', 'hello-interval')) set({ ospf: i.ospf ? { ...i.ospf, hello: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf', 'dead-interval')) set({ ospf: i.ospf ? { ...i.ospf, dead: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf') && w[3]?.startsWith('area')) set({ ospf: neg ? undefined : { ...(i.ospf ?? {}), area: Number(w[4]) } });
      else if (has('delay')) set({ eigrp: i.eigrp ? { ...i.eigrp, delay: neg ? undefined : Number(w[1]) * 10 } : i.eigrp });
      else if (has('bandwidth')) {
        /* accepted: bandwidth comes from the port speed in this lab */
      }
      else if (has('mtu') || has('ip', 'mtu')) set({ mtu: neg ? undefined : Number(w.at(-1)) });
      else if (has('spanning-tree', 'portfast')) {
        set({ portfast: !neg });
        if (!neg && i.mode === 'trunk' && !w.includes('trunk')) out.push('%Warning: portfast should only be enabled on ports connected to a single host.');
      } else if (has('spanning-tree', 'bpduguard')) set({ bpduGuard: neg ? undefined : !w[2]?.startsWith('d') });
      else if (has('spanning-tree', 'guard')) set({ rootGuard: !neg && w[2]?.startsWith('r') });
      else if (has('ip', 'dhcp', 'snooping', 'trust') || has('ip', 'arp', 'inspection', 'trust')) set({ dhcpTrust: !neg });
      else if (has('ip', 'dhcp', 'snooping', 'limit')) {
        /* rate limit: accepted */
      } else if (has('ip', 'access-group')) {
        const dir = (w[3] ?? 'in').startsWith('o') ? 'aclOut' : 'aclIn';
        if (!isRouter(d) && i.mode !== 'routed' && !/^vlan/i.test(name)) return '% AEGIS: apply ACLs on routed interfaces or SVIs (port ACLs are not modelled).';
        set({ [dir]: neg ? undefined : r[2] } as Partial<Iface>);
        if (!neg && !d.acls?.some((a) => a.name === r[2])) out.push(`% Note: access list ${r[2]} is not defined yet; until it is, it permits everything.`);
      } else if (has('vrrp') || has('glbp')) {
        const proto = w[0].startsWith('v') ? 'vrrp' : 'glbp';
        const g = Number(w[1]);
        const h = i.hsrp?.proto === proto ? i.hsrp : { group: g, vip: '', priority: 100, preempt: proto === 'vrrp', proto };
        if (neg) set({ hsrp: undefined });
        else if (w[2] === 'ip' && isIp(r[3])) set({ hsrp: { ...h, group: g, vip: r[3], proto } });
        else if (w[2]?.startsWith('pri')) set({ hsrp: { ...h, group: g, priority: Number(w[3]) || 100, proto } });
        else if (w[2]?.startsWith('pre')) set({ hsrp: { ...h, group: g, preempt: true, proto } });
        else if (w[2]?.startsWith('load') || w[2]?.startsWith('auth') || w[2]?.startsWith('desc')) {
          /* accepted */
        } else return `% ${proto} <group> ip <vip> | priority <n> | preempt`;
      }
      else if (has('encapsulation', 'dot1q')) set({ vlan: Number(w[2]) });
      else if (has('no')) return '';
      else return `% Invalid input detected: "${r.join(' ')}" in interface mode.`;
    }
    return out.join('\r\n');
  }

  private routerCmd(w: string[], r: string[], neg: boolean, has: (...p: string[]) => boolean): string {
    const st = useLab.getState();
    const d = this.d;
    if (has('network')) {
      const [net, wild, , area] = r.slice(1);
      const prefix = isIp(wild) ? wildcardToPrefix(wild) : null;
      if (!isIp(net) || prefix === null || area === undefined) return '% network <address> <wildcard> area <id>';
      const base = ipToInt(net)!;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      let n = 0;
      for (const i of l3Ifaces(d)) {
        if (((ipToInt(i.ip!)! & mask) >>> 0) !== ((base & mask) >>> 0)) continue;
        st.updateIface(d.id, i.name, { ospf: neg ? undefined : { ...(i.ospf ?? {}), area: Number(area) } });
        n++;
      }
      return n ? '' : '% AEGIS: no interface address matches that network yet; it will not be advertised.';
    }
    if (has('router-id')) {
      if (!neg && !isIp(r[1])) return '% Invalid router-id.';
      st.updateDevice(d.id, { ospfProcess: { ...(d.ospfProcess ?? {}), routerId: neg ? undefined : r[1] } });
      return 'Reload or use "clear ip ospf process" command, for this to take effect';
    }
    if (has('default-information', 'originate')) {
      st.updateDevice(d.id, { ospfProcess: { ...(d.ospfProcess ?? {}), defaultOriginate: !neg } });
      return '';
    }
    if (has('passive-interface')) {
      const i = resolveIface(d, r[1] ?? '');
      if (typeof i === 'string') return `% No interface ${i}.`;
      st.updateIface(d.id, i.name, { ospf: i.ospf ? { ...i.ospf, passive: !neg } : i.ospf });
      return i.ospf ? '' : '% AEGIS: that interface is not in OSPF yet (add a network statement first).';
    }
    if (has('auto-cost') || has('log-adjacency-changes')) return '';
    return '% Invalid input in router mode (network, router-id, passive-interface, default-information originate).';
  }

  private eigrpCmd(w: string[], r: string[], neg: boolean, has: (...p: string[]) => boolean): string {
    const st = useLab.getState();
    const d = this.d;
    const as = this.eigrpAs;
    if (has('network')) {
      const net = r[1];
      if (!isIp(net)) return '% network <address> [wildcard]';
      const first = Number(net.split('.')[0]);
      const classful = first < 128 ? 8 : first < 192 ? 16 : 24;
      const prefix = isIp(r[2]) ? wildcardToPrefix(r[2]) : classful;
      if (prefix === null) return '% Bad wildcard mask.';
      const base = ipToInt(net)!;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      let n = 0;
      for (const i of l3Ifaces(d)) {
        if (((ipToInt(i.ip!)! & mask) >>> 0) !== ((base & mask) >>> 0)) continue;
        st.updateIface(d.id, i.name, { eigrp: neg ? undefined : { ...(i.eigrp ?? {}), as } });
        n++;
      }
      return n ? '' : '% AEGIS: no interface address matches that network yet; it will not be advertised.';
    }
    if (has('passive-interface')) {
      const i = resolveIface(d, r[1] ?? '');
      if (typeof i === 'string') return `% No interface ${i}.`;
      st.updateIface(d.id, i.name, { eigrp: i.eigrp ? { ...i.eigrp, passive: !neg } : i.eigrp });
      return i.eigrp ? '' : '% AEGIS: that interface is not in EIGRP yet (add a network statement first).';
    }
    if (has('eigrp', 'router-id')) {
      st.updateDevice(d.id, { eigrpProcess: { ...(d.eigrpProcess ?? { as }), routerId: neg ? undefined : r[2] } });
      return '';
    }
    if (has('auto-summary') || has('metric') || has('variance') || has('maximum-paths')) return '';
    return '% Invalid input in EIGRP mode (network <ip> [wildcard], passive-interface <if>, no auto-summary, eigrp router-id <ip>).';
  }

  private aclCmd(raw: string[], neg: boolean, has: (...p: string[]) => boolean): string {
    const st = useLab.getState();
    const d = this.d;
    const acls = d.acls ?? [];
    const acl = acls.find((a) => a.name === this.aclName);
    if (!acl) return '% ACL no longer exists.';
    const tok = neg ? raw.slice(1) : raw;
    if (neg && /^\d+$/.test(tok[0] ?? '')) {
      st.updateDevice(d.id, { acls: acls.map((a) => (a === acl ? { ...a, entries: a.entries.filter((e) => e.seq !== Number(tok[0])) } : a)) });
      return '';
    }
    let seq = (acl.entries.reduce((m, e) => Math.max(m, e.seq), 0) || 0) + 10;
    let body = tok;
    if (/^\d+$/.test(tok[0] ?? '')) {
      seq = Number(tok[0]);
      body = tok.slice(1);
    }
    void has;
    const e = parseAclEntry(acl.type, body, seq);
    if (typeof e === 'string') return e;
    const entries = [...acl.entries.filter((x) => x.seq !== seq), e].sort((a, b) => a.seq - b.seq);
    st.updateDevice(d.id, { acls: acls.map((a) => (a === acl ? { ...a, entries } : a)) });
    return '';
  }

  // ---------------- show / exec ----------------
  private privCmd(line: string): string {
    const st = useLab.getState();
    const doc = st.doc!;
    const d = this.d;
    const w = line.toLowerCase().split(/\s+/);
    const is = (...p: string[]) => p.every((x, k) => w[k] !== undefined && x.startsWith(w[k]));
    if (is('ping')) return this.pingCmd(line.split(/\s+/).slice(1), false);
    if (is('traceroute') || is('tracert')) return this.traceCmd(line.split(/\s+/)[1], false);
    if (is('write') || is('copy', 'running-config', 'startup-config') || is('wr')) {
      st.updateDevice(d.id, { startupSaved: runningConfig(d) });
      return 'Building configuration...\r\n[OK]';
    }
    if (is('reload')) return '% AEGIS: use the device Actions tab to power cycle.';
    if (is('clear', 'port-security')) {
      const ifName = line.split(/\s+/).slice(line.toLowerCase().includes('interface') ? 4 : 3).join('');
      for (const i of d.interfaces.filter((x) => x.portSecurity && (!ifName || x.name.toLowerCase() === (typeof resolveIface(d, ifName) === 'string' ? ifName : (resolveIface(d, ifName) as Iface).name).toLowerCase())))
        st.updateIface(d.id, i.name, { portSecurity: { ...i.portSecurity!, macs: [] } });
      return '';
    }
    if (is('clear')) return '';
    if (is('terminal')) return '';
    if (!is('show')) return `% Invalid input detected: "${line}". Type ? for help.`;
    const cp = controlPlane(doc);
    const sub = w.slice(1);
    const s = (...p: string[]) => p.every((x, k) => sub[k] !== undefined && x.startsWith(sub[k]));
    if (s('running-config') || s('run')) return runningConfig(d).replace(/\n/g, '\r\n');
    if (s('startup-config') || s('start')) return (d.startupSaved ?? 'startup-config is not present').replace(/\n/g, '\r\n');
    if (s('version')) return `${modelOf(d).vendor} ${modelOf(d).name}, lab designer model\r\n${d.name} uptime is simulated\r\nBase ethernet MAC Address: ${d.interfaces.find((i) => i.mac)?.mac ?? 'n/a'}`;
    if (s('ip', 'interface', 'brief') || (s('ip', 'int') && sub[2]?.startsWith('b'))) {
      const rows = d.interfaces.filter((i) => i.type !== 'console' && i.type !== 'terminal').map((i) => {
        const c = cableOnPort(doc, d.id, i.name);
        const phys = i.shutdown ? 'administratively down' : i.parent || /^(vlan|loopback|tunnel)/i.test(i.name) || i.bridge ? 'up' : c ? (cableStatus(doc, c).state === 'down' || cableStatus(doc, c).state === 'disabled' ? 'down' : 'up') : 'down';
        return `${pad(i.name, 23)}${pad(i.ip ?? 'unassigned', 16)}YES ${pad(i.dhcp ? 'DHCP' : i.ip ? 'manual' : 'unset', 7)}${pad(phys, 22)}${phys === 'up' ? 'up' : 'down'}`;
      });
      return `Interface              IP-Address      OK? Method Status                Protocol\r\n${rows.join('\r\n')}`;
    }
    if (s('interfaces', 'status', 'err-disabled') || s('int', 'status', 'err-disabled')) {
      const rows = d.interfaces.filter((i) => i.errDisabled);
      return `Port      Name               Status       Reason\r\n${rows.map((i) => `${pad(i.name, 10)}${pad((i.description ?? '').slice(0, 18), 19)}${pad('err-disabled', 13)}${i.errDisabled!.startsWith('BPDU') ? 'bpduguard' : 'psecure-violation'}`).join('\r\n')}`;
    }
    if (s('interfaces', 'trunk') || s('int', 'trunk')) {
      const trunks = d.interfaces.filter((i) => i.mode === 'trunk' && !i.shutdown && cableOnPort(doc, d.id, i.name));
      const block = (title: string, f: (i: Iface) => string) => `\r\nPort        ${title}\r\n${trunks.map((i) => `${pad(i.name, 12)}${f(i)}`).join('\r\n')}`;
      const allowed = (i: Iface) => (i.allowedVlans === undefined || i.allowedVlans === 'all' ? '1-4094' : i.allowedVlans.join(','));
      const active = (i: Iface) => Object.keys(d.vlans).map(Number).filter((v) => i.allowedVlans === undefined || i.allowedVlans === 'all' || i.allowedVlans.includes(v)).join(',');
      return `Port        Mode             Encapsulation  Status        Native vlan\r\n${trunks.map((i) => `${pad(i.name, 12)}${pad(i.dtp ? i.dtp : 'on', 17)}${pad('802.1q', 15)}${pad('trunking', 14)}${i.nativeVlan ?? 1}`).join('\r\n')}\r\n${block('Vlans allowed on trunk', allowed)}\r\n${block('Vlans allowed and active in management domain', active)}\r\n${block('Vlans in spanning tree forwarding state and not pruned', (i) => (cp.l2.blocked.has(`${d.id}/${i.name}`) ? 'none' : active(i)))}`;
    }
    if (s('interfaces', 'status') || s('int', 'status')) {
      const rows = d.interfaces.filter((i) => !i.parent && i.type !== 'console' && !/^vlan/i.test(i.name)).map((i) => {
        const c = cableOnPort(doc, d.id, i.name);
        const stt = c ? cableStatus(doc, c) : null;
        const status = i.shutdown ? 'disabled' : i.errDisabled ? 'err-disabled' : cp.l2.blocked.has(`${d.id}/${i.name}`) && cp.stp[d.id]?.ports[i.name]?.state === 'blocking' ? 'blocking' : !c ? 'notconnect' : stt!.state === 'down' ? 'notconnect' : 'connected';
        const neg = stt?.negotiated?.match(/^([\d.]+ \S+) (\w+)/);
        return `${pad(i.name, 10)}${pad((i.description ?? '').slice(0, 18), 19)}${pad(status, 13)}${pad(i.mode === 'trunk' ? 'trunk' : String(i.vlan ?? (i.mode === 'routed' ? 'routed' : 1)), 11)}${pad(i.duplex === 'auto' ? (neg ? `a-${neg[2]}` : 'auto') : i.duplex, 7)}${pad(i.speed === 'auto' ? (neg ? `a-${neg[1].replace(' Gb/s', '000').replace(' Mb/s', '')}` : 'auto') : String(i.speed), 7)}${i.type === 'sfp' ? '1000BaseSX SFP' : '10/100/1000BaseTX'}`;
      });
      return `Port      Name               Status       Vlan       Duplex Speed  Type\r\n${rows.join('\r\n')}`;
    }
    if (s('interfaces') && sub[1]) {
      const i = resolveIface(d, sub.slice(1).join(''));
      if (typeof i === 'string') return `% Invalid interface ${i}`;
      const c = cableOnPort(doc, d.id, i.name);
      const stt = c ? cableStatus(doc, c) : null;
      return [`${i.name} is ${i.shutdown ? 'administratively down' : stt && stt.state !== 'down' ? 'up' : 'down'}, line protocol is ${stt && stt.state !== 'down' && !i.shutdown ? 'up' : 'down'}`, `  Hardware is ${i.type === 'sfp' ? 'SFP' : 'Gigabit Ethernet'}, address is ${i.mac ? ciscoMac(i.mac) : 'n/a'}`, ...(i.ip ? [`  Internet address is ${i.ip}/${i.prefix}`] : []), `  MTU ${i.mtu ?? 1500} bytes, BW ${(i.speed === 'auto' ? Math.max(...i.speeds) : i.speed) * 1000} Kbit/sec`, `  ${stt?.negotiated ?? (i.speed === 'auto' ? 'Auto-duplex, Auto-speed' : `${i.duplex}-duplex, ${i.speed}Mb/s`)}`, `     ${i.counters?.inputErrors ?? 0} input errors, ${i.counters?.crc ?? 0} CRC, 0 frame, 0 overrun, 0 ignored`, `     0 output errors, 0 collisions, ${i.counters?.lateCollisions ?? 0} late collision`].join('\r\n');
    }
    if (s('ip', 'route')) {
      const routes = cp.routes[d.id] ?? [];
      const head = 'Codes: C - connected, S - static, D - EIGRP, O - OSPF, IA - OSPF inter area, E2 - OSPF external type 2, * - candidate default\r\n';
      const def = routes.find((x) => x.prefix === '0.0.0.0/0');
      const gw = def ? `Gateway of last resort is ${def.via ?? def.iface} to network 0.0.0.0\r\n` : 'Gateway of last resort is not set\r\n';
      return head + '\r\n' + gw + '\r\n' + routes.map((x) => (x.kind === 'connected' ? `C        ${x.prefix} is directly connected, ${x.iface}` : `${pad(x.code ?? 'S', 9)}${x.prefix} [${x.ad ?? 1}/${x.metric ?? 0}] via ${x.via ?? x.iface}${x.iface && x.via ? `, ${x.iface}` : ''}`)).join('\r\n');
    }
    if (s('vlan')) {
      const rows = Object.entries(d.vlans).map(([id, name]) => {
        const ports = d.interfaces.filter((i) => (i.mode ?? 'access') === 'access' && (i.vlan ?? 1) === Number(id) && !i.parent && i.type !== 'console' && !/^vlan/i.test(i.name)).map((i) => i.name);
        return `${pad(id, 5)}${pad(name, 33)}active    ${ports.join(', ')}`;
      });
      return `VLAN Name                             Status    Ports\r\n---- -------------------------------- --------- -------------------------------\r\n${rows.join('\r\n')}`;
    }
    if (s('mac', 'address-table') || s('mac-address-table')) {
      if (d.kind !== 'switch') return '% Not a switch.';
      const t = macTable(doc, d.id);
      return `          Mac Address Table\r\n-------------------------------------------\r\nVlan    Mac Address       Type        Ports\r\n----    -----------       --------    -----\r\n${t.map((e) => `${pad(String(e.vlan), 8)}${pad(ciscoMac(e.mac), 18)}DYNAMIC     ${e.port}`).join('\r\n')}\r\nTotal Mac Addresses for this criterion: ${t.length}`;
    }
    if (s('arp') || s('ip', 'arp')) {
      const t = arpTable(doc, d.id);
      return `Protocol  Address          Age (min)  Hardware Addr   Type   Interface\r\n${t.map((e) => `Internet  ${pad(e.ip, 17)}${pad('0', 11)}${pad(e.mac ? ciscoMac(e.mac) : 'Incomplete', 16)}ARPA   ${e.iface}`).join('\r\n')}`;
    }
    if (s('spanning-tree')) {
      const b = cp.stp[d.id];
      if (!b) return '% Not a switch.';
      if (!b.enabled) return 'No spanning tree instance exists (spanning tree is disabled).';
      const root = Object.values(cp.stp).find((x) => x.bridgeId === b.rootId);
      return [`VLAN0001 (common spanning tree for all VLANs)`, `  Spanning tree enabled protocol ${d.stp?.mode === 'pvst' ? 'ieee' : d.stp?.mode === 'mst' ? 'mstp' : 'rstp'}`, `  Root ID    Priority    ${root?.priority}`, `             Address     ${root ? ciscoMac(root.mac) : ''}`, b.isRoot ? '             This bridge is the root' : `             Cost        ${b.rootCost}\r\n             Port        ${b.rootPort}`, ``, `  Bridge ID  Priority    ${b.priority}`, `             Address     ${ciscoMac(b.mac)}`, ``, `Interface           Role Sts Cost      Prio.Nbr Type`, `------------------- ---- --- --------- -------- ----`, ...Object.entries(b.ports).sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true })).map(([p, v]) => `${pad(p, 20)}${pad({ root: 'Root', designated: 'Desg', alternate: 'Altn', edge: 'Desg', disabled: 'Disb', 'root-inconsistent': 'Desg' }[v.role], 5)}${pad(v.role === 'root-inconsistent' ? 'BKN' : { forwarding: 'FWD', blocking: 'BLK', disabled: 'DIS' }[v.state], 4)}${pad(String(v.cost), 10)}128.1    P2p${v.role === 'edge' ? ' Edge' : ''}${v.role === 'root-inconsistent' ? ' *ROOT_Inc' : ''}${d.interfaces.find((x) => x.name === p && bpduGuardOn(d, x)) ? ' (bpduguard)' : ''}`)].join('\r\n');
    }
    if (s('etherchannel', 'summary') || s('etherchannel')) {
      const chs = cp.channels.filter((c) => c.device === d.id);
      return `Flags:  D - down  P - bundled in port-channel  s - suspended  S - Layer2  U - in use\r\nGroup  Port-channel  Protocol    Ports\r\n------+-------------+-----------+-----------------------------------------------\r\n${chs.map((c) => `${pad(String(c.group), 7)}${pad(`Po${c.group}(${c.ok ? 'SU' : 'SD'})`, 14)}${pad(c.protocol === 'static' ? '-' : c.protocol, 12)}${c.members.map((m) => `${m}(${c.ok ? 'P' : 's'})`).join(' ')}${c.ok ? '' : `\r\n       ! ${c.reason}`}`).join('\r\n')}`;
    }
    if (s('ip', 'ospf', 'neighbor')) {
      const ns = cp.ospf.filter((n) => n.device === d.id);
      return `Neighbor ID     Pri   State           Dead Time   Address         Interface\r\n${ns.map((n) => `${pad(n.peerRid, 16)}${pad('1', 6)}${pad(`${n.state}/${n.state === 'FULL' ? 'DR' : '-'}`, 16)}${pad(n.state === 'FULL' ? '00:00:35' : '-', 12)}${pad(n.peerIp, 16)}${n.iface}${n.reason ? `\r\n  ! ${n.reason}` : ''}`).join('\r\n')}`;
    }
    if (s('ip', 'ospf')) return `Routing Process "ospf ${this.ospfPid}" with ID ${cp.routerIds[d.id] ?? 'not running'}\r\n${d.interfaces.filter((i) => i.ospf).map((i) => `  ${i.name}: area ${i.ospf!.area}, cost ${i.ospf!.cost ?? 'auto'}${i.ospf!.passive ? ', passive' : ''}`).join('\r\n')}`;
    if (s('standby')) {
      const rows = cp.hsrp.flatMap((g) => g.members.filter((m) => m.device === d.id).map((m) => `${pad(m.iface, 11)}${pad(String(g.group), 4)}${pad(String(m.priority), 5)}${pad(g.active?.device === d.id && g.active.iface === m.iface ? 'Active' : g.standby?.device === d.id && g.standby.iface === m.iface ? 'Standby' : m.up ? 'Listen' : 'Init', 10)}${pad(g.active ? (deviceById(doc, g.active.device)?.interfaces.find((x) => x.name === g.active!.iface)?.ip ?? '') : 'unknown', 16)}${pad(g.standby ? (deviceById(doc, g.standby.device)?.interfaces.find((x) => x.name === g.standby!.iface)?.ip ?? '') : 'unknown', 16)}${g.vip}`));
      return `Interface  Grp Pri  State     Active          Standby         Virtual IP\r\n${rows.join('\r\n')}`;
    }
    if (s('ip', 'nat', 'translations')) {
      const t = st.traces.filter((x) => x.nat?.device === d.id);
      const statics = (d.staticNat ?? []).map((n) => `${pad('---', 4)}${pad(n.outside, 22)}${pad(n.inside, 22)}${pad('---', 22)}---`);
      return `Pro Inside global         Inside local          Outside local         Outside global\r\n${[...statics, ...t.map((x) => `${pad(x.nat!.proto, 4)}${pad(x.nat!.outside, 22)}${pad(x.nat!.inside, 22)}${pad(x.request.dst, 22)}${x.request.dst}`)].join('\r\n')}${t.length || statics.length ? '' : '\r\n(no translations yet: send traffic from an inside host to the outside)'}`;
    }
    if (s('port-security')) {
      const target = sub[1]?.startsWith('int') ? resolveIface(d, sub.slice(2).join('')) : undefined;
      if (target && typeof target !== 'string') {
        const i = target;
        const ps = i.portSecurity;
        const stt = portSecurityState(doc, d, i);
        return [`Port Security              : ${ps?.enabled ? 'Enabled' : 'Disabled'}`, `Port Status                : ${i.errDisabled ? 'Secure-shutdown' : ps?.enabled ? 'Secure-up' : 'Secure-down'}`, `Violation Mode             : ${ps ? ps.violation[0].toUpperCase() + ps.violation.slice(1) : 'Shutdown'}`, `Maximum MAC Addresses      : ${ps?.max ?? 1}`, `Total MAC Addresses        : ${stt?.allowed.size ?? 0}`, `Configured MAC Addresses   : ${ps?.sticky ? 0 : ps?.macs.length ?? 0}`, `Sticky MAC Addresses       : ${ps?.sticky ? ps.macs.length : 0}`, `Last Source Address:Vlan   : ${macsBehind(doc, d, i)[0] ? `${ciscoMac(macsBehind(doc, d, i)[0].mac)}:${i.vlan ?? 1}` : '0000.0000.0000:0'}`, `Security Violation Count   : ${stt?.offenders.length ?? 0}`, ...(i.errDisabled ? [`! ${i.errDisabled}`] : [])].join('\r\n');
      }
      const rows = d.interfaces.filter((i) => i.portSecurity?.enabled).map((i) => {
        const stt = portSecurityState(doc, d, i);
        return `${pad(i.name, 15)}${pad(String(i.portSecurity!.max), 15)}${pad(String(stt?.allowed.size ?? 0), 15)}${pad(String(stt?.offenders.length ?? 0), 18)}${i.portSecurity!.violation[0].toUpperCase() + i.portSecurity!.violation.slice(1)}${i.errDisabled ? ' (err-disabled)' : ''}`;
      });
      return `Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action\r\n                (Count)       (Count)          (Count)\r\n---------------------------------------------------------------------------\r\n${rows.join('\r\n')}`;
    }
    if (s('ip', 'dhcp', 'snooping')) {
      const sn = d.dhcpSnooping;
      if (sub[3]?.startsWith('b')) {
        const rows = d.interfaces.flatMap((i) => (sn?.enabled && !i.dhcpTrust ? macsBehind(doc, d, i).map((m) => ({ i, m })) : [])).flatMap(({ i, m }) => {
          const host = doc.devices.find((x) => x.interfaces.some((y) => y.mac.toLowerCase() === m.mac && y.dhcp && y.ip));
          const nic = host?.interfaces.find((y) => y.mac.toLowerCase() === m.mac);
          return nic && sn!.vlans.includes(i.vlan ?? 1) ? [`${pad(ciscoMac(m.mac), 19)}${pad(nic.ip!, 17)}${pad('86400', 12)}${pad('dhcp-snooping', 15)}${pad(String(i.vlan ?? 1), 6)}${i.name}`] : [];
        });
        return `MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface\r\n------------------  ---------------  ----------  -------------  ----  --------------------\r\n${rows.join('\r\n')}\r\nTotal number of bindings: ${rows.length}`;
      }
      return [`Switch DHCP snooping is ${sn?.enabled ? 'enabled' : 'disabled'}`, `DHCP snooping is configured on following VLANs:`, sn?.vlans.join(',') || 'none', `Insertion of option 82 is enabled`, `Interface                  Trusted    Allow option    Rate limit (pps)`, `-----------------------    -------    ------------    ----------------`, ...d.interfaces.filter((i) => i.dhcpTrust).map((i) => `${pad(i.name, 27)}${pad('yes', 11)}${pad('yes', 16)}unlimited`)].join('\r\n');
    }
    if (s('ip', 'arp', 'inspection')) return [`Source Mac Validation      : Disabled`, `Destination Mac Validation : Disabled`, `IP Address Validation      : Disabled`, ``, ` Vlan     Configuration    Operation   ACL Match          Static ACL`, ...(d.dai?.vlans ?? []).map((v) => ` ${pad(String(v), 9)}${pad('Enabled', 17)}${pad(d.dhcpSnooping?.enabled ? 'Active' : 'Inactive', 12)}`), ``, ` Interface        Trust State`, ...d.interfaces.filter((i) => i.dhcpTrust).map((i) => ` ${pad(i.name, 17)}Trusted`)].join('\r\n');
    if (s('access-lists') || s('ip', 'access-lists')) {
      const name = s('ip') ? sub[2] : sub[1];
      const hits = new Map<string, number>();
      for (const t of st.traces) for (const h of t.hops) if (h.device === d.id && h.acl?.descr.includes(':')) hits.set(h.acl.descr, (hits.get(h.acl.descr) ?? 0) + 1);
      return (d.acls ?? []).filter((a) => !name || a.name === name).map((a) => `${a.type === 'standard' ? 'Standard' : 'Extended'} IP access list ${a.name}\r\n${a.entries.map((e) => (e.remark ? `    ${e.seq} remark ${e.remark}` : `    ${aclEntryText(a, e)}${hits.get(`${a.name}: ${aclEntryText(a, e)}`) ? ` (${hits.get(`${a.name}: ${aclEntryText(a, e)}`)} matches)` : ''}`)).join('\r\n')}`).join('\r\n') || '% No access lists configured.';
    }
    if (s('vtp', 'status')) {
      const v = d.vtp;
      if (d.kind !== 'switch') return '% VTP is a switch feature.';
      return [`VTP Version capable             : 1 to 3`, `VTP version running             : ${v?.version ?? 1}`, `VTP Domain Name                 : ${v?.domain || ''}`, `VTP Pruning Mode                : Disabled`, `VTP Operating Mode              : ${v ? (v.mode === 'off' ? 'Off' : v.mode[0].toUpperCase() + v.mode.slice(1)) : 'Server'}`, `Maximum VLANs supported locally : 1005`, `Number of existing VLANs        : ${Object.keys(d.vlans).length + 4}`, `Configuration Revision          : ${v?.revision ?? 0}`].join('\r\n');
    }
    if (s('monitor')) return (d.span ?? []).map((x) => `Session ${x.session}\r\n---------\r\nType                   : Local Session\r\nSource Ports           :\r\n    Both               : ${x.sources.join(',')}\r\nDestination Ports      : ${x.dest || 'none'}\r\n    Encapsulation      : Native`).join('\r\n\r\n') || 'No SPAN sessions configured.';
    if (s('vrrp') || s('glbp')) {
      const proto = sub[0].startsWith('v') ? 'vrrp' : 'glbp';
      const rows = cp.hsrp.filter((g) => g.proto === proto).flatMap((g) => g.members.filter((m) => m.device === d.id).map((m) => `${pad(m.iface, 11)}${pad(String(g.group), 4)}${pad(String(m.priority), 5)}${pad(g.active?.device === d.id && g.active.iface === m.iface ? (proto === 'vrrp' ? 'Master' : 'Active') : m.up ? (proto === 'vrrp' ? 'Backup' : 'Standby') : 'Init', 10)}${pad(g.active ? (deviceById(doc, g.active.device)?.interfaces.find((x) => x.name === g.active!.iface)?.ip ?? '') : 'unknown', 16)}${g.vip}`));
      return `Interface  Grp Pri  State     ${proto === 'vrrp' ? 'Master addr' : 'Active AVG '}     Group addr\r\n${rows.join('\r\n')}${proto === 'glbp' && rows.length ? `\r\n(GLBP shares hosts across ${cp.l2.glbp?.get(cp.hsrp.find((g) => g.proto === 'glbp' && g.members.some((m) => m.device === d.id))?.vip ?? '')?.length ?? 0} active virtual forwarders)` : ''}`;
    }
    if (s('ip', 'eigrp', 'neighbors')) {
      const ns = cp.eigrp.filter((n) => n.device === d.id);
      return `EIGRP-IPv4 Neighbors for AS(${d.eigrpProcess?.as ?? '-'})\r\nH   Address                 Interface              Hold Uptime   SRTT   RTO  Q  Seq\r\n${ns.filter((n) => n.up).map((n, k) => `${pad(String(k), 4)}${pad(n.peerIp, 24)}${pad(n.iface, 23)}${pad('13', 5)}00:01:12 ${pad('1', 7)}100  0  ${k + 3}`).join('\r\n')}${ns.filter((n) => !n.up).map((n) => `\r\n  ! ${n.peerIp} (${deviceById(doc, n.peer)?.name}): ${n.reason}`).join('')}`;
    }
    if (s('ip', 'protocols')) {
      const lines: string[] = [];
      if (d.ospfProcess || d.interfaces.some((i) => i.ospf)) lines.push(`Routing Protocol is "ospf ${this.ospfPid}"`, `  Router ID ${cp.routerIds[d.id] ?? '-'}`, `  Routing for Networks: ${d.interfaces.filter((i) => i.ospf && i.ip).map((i) => `${i.ip} area ${i.ospf!.area}`).join(', ')}`, `  Passive Interface(s): ${d.interfaces.filter((i) => i.ospf?.passive).map((i) => i.name).join(', ') || 'none'}`, `  Distance: (default is 110)`);
      if (d.eigrpProcess || d.interfaces.some((i) => i.eigrp)) lines.push(`Routing Protocol is "eigrp ${d.eigrpProcess?.as ?? ''}"`, `  Automatic Summarization: disabled`, `  Routing for Networks: ${d.interfaces.filter((i) => i.eigrp && i.ip).map((i) => i.ip).join(', ')}`, `  Passive Interface(s): ${d.interfaces.filter((i) => i.eigrp?.passive).map((i) => i.name).join(', ') || 'none'}`, `  Distance: internal 90 external 170`);
      return lines.join('\r\n') || '% No IP routing protocol is running.';
    }
    if (s('cdp', 'neighbors') || s('lldp', 'neighbors')) {
      const n = cdpNeighbors(doc, d.id);
      return `Capability Codes: R - Router, S - Switch, H - Host, I - IGMP, T - AP\r\nDevice ID        Local Intrfce     Capability  Platform              Port ID\r\n${n.map((x) => `${pad(x.peer, 17)}${pad(x.local, 18)}${pad(x.capability, 12)}${pad(x.platform.slice(0, 21), 22)}${x.peerPort}`).join('\r\n')}`;
    }
    if (s('power', 'inline')) {
      const p = poeUsage(doc, d.id);
      if (!p.budget) return '% This switch does not support PoE.';
      return `Available:${p.budget.toFixed(1)}(w)  Used:${p.used.toFixed(1)}(w)  Remaining:${(p.budget - p.used).toFixed(1)}(w)\r\nInterface Admin  Oper       Power   Device\r\n${p.ports.map((x) => `${pad(x.port, 10)}auto   on         ${pad(x.watts.toFixed(1), 8)}${x.device}`).join('\r\n')}`;
    }
    if (s('ip', 'dhcp', 'pool')) return (d.dhcpPools ?? []).map((p) => `Pool ${p.name} :\r\n Network ${p.network}  Range ${p.start} - ${p.end}\r\n Default router ${p.gateway ?? '-'}  DNS ${(p.dns ?? []).join(' ')}`).join('\r\n') || '% No DHCP pools.';
    return `% Invalid input detected: "${line}". Type ? for help.`;
  }

  private help(): string {
    if (this.mode === 'user' || this.mode === 'priv')
      return ['enable / disable / configure terminal / write memory', 'show running-config | startup-config | ip interface brief | interfaces status | interfaces <if>', 'show ip route | ip ospf neighbor | standby | ip nat translations | ip dhcp pool', 'show vlan | mac address-table | spanning-tree | etherchannel summary | cdp neighbors | arp | power inline', 'show interfaces trunk | interfaces status err-disabled | port-security [interface <if>] | vtp status | monitor', 'show ip dhcp snooping [binding] | ip arp inspection | access-lists | vrrp | glbp | ip eigrp neighbors | ip protocols', 'clear port-security sticky [interface <if>]', 'ping <ip|device> [repeat n]   traceroute <ip|device>'].join('\r\n');
    if (this.mode === 'config') return ['hostname <name>   interface <if> | interface range <if - n>   vlan <id> (name <n>)', 'ip route <net> <mask> <next-hop>   ip default-gateway <ip>   router ospf <pid>', 'spanning-tree vlan 1 priority <n> | root primary   no spanning-tree vlan 1', 'ip nat inside source list 1 interface <if> overload   ip dhcp pool <name>', 'enable secret <pw>   banner motd #text#   crypto key generate rsa   line vty 0 15 (transport input ssh)', 'ip routing (layer 3 switch)   spanning-tree mode rapid-pvst   spanning-tree portfast default | portfast bpduguard default', 'vtp mode server|client|transparent   vtp domain <name>   vtp password <pw>', 'ip dhcp snooping   ip dhcp snooping vlan <list>   ip arp inspection vlan <list>', 'access-list <1-99> permit|deny <src>   access-list <100-199> permit|deny <proto> <src> <dst> [eq <port>]', 'ip access-list standard|extended <name>   ip nat inside source static <local> <global>   router eigrp <as>', 'monitor session <n> source|destination interface <if>'].join('\r\n');
    if (this.mode === 'if') return ['ip address <ip> <mask> | ip address dhcp   [no] shutdown   description <text>', 'switchport mode access|trunk   switchport access vlan <n>   switchport trunk allowed vlan <list|add|remove>', 'switchport trunk native vlan <n>   speed <10|100|1000|auto>   duplex <full|half|auto>   mtu <bytes>', 'channel-group <n> mode active|passive|on|desirable|auto   spanning-tree portfast', 'standby <g> ip <vip> | priority <n> | preempt   ip nat inside|outside   ip helper-address <ip>', 'ip ospf <pid> area <a>   ip ospf cost|hello-interval|dead-interval <n>   encapsulation dot1Q <vlan>', 'switchport mode dynamic auto|desirable   switchport nonegotiate   [no] switchport (routed port)', 'switchport port-security [maximum <n> | violation shutdown|restrict|protect | mac-address sticky|<H.H.H>]', 'spanning-tree bpduguard enable   spanning-tree guard root   ip dhcp snooping trust   ip arp inspection trust', 'ip access-group <acl> in|out   vrrp|glbp <g> ip <vip> | priority <n> | preempt'].join('\r\n');
    if (this.mode === 'router') return this.routerProto === 'eigrp' ? 'network <ip> [wildcard]   passive-interface <if>   no auto-summary   eigrp router-id <ip>' : 'network <ip> <wildcard> area <a>   router-id <ip>   passive-interface <if>   default-information originate';
    if (this.mode === 'acl') return '[seq] permit|deny ...   remark <text>   no <seq>   exit';
    if (this.mode === 'dhcp') return 'network <ip> <mask>   default-router <ip>   dns-server <ip>';
    return 'exit / end';
  }
}

function intToIpLocal(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export { dhcpLease };
