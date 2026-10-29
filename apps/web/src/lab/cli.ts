// IOS-style CLI for devices designed on the canvas (Packet Tracer's CLI tab), and a Windows-style
// command prompt for hosts. Commands read and change the lab document through the store, so a
// change typed here shows up on the canvas, in the inspector and in packet simulation at once.
import { modelOf } from './catalog';
import { runningConfig } from './config';
import { ciscoMac, ipToInt, isIp, maskToPrefix, prefixToMask } from './net';
import { arpTable, cdpNeighbors, controlPlane, dhcpLease, macTable, poeUsage } from './protocols';
import { l3Ifaces, ping, primaryIp, traceroute } from './simulate';
import { useLab } from './store';
import type { Device, Iface, Route } from './types';
import { cableOnPort, cableStatus, deviceById } from './validate';

type Mode = 'user' | 'priv' | 'config' | 'if' | 'router' | 'vlan' | 'line' | 'dhcp';

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

export class DesignCli {
  node: string;
  private mode: Mode = 'user';
  private ifs: string[] = [];
  private ospfPid = 1;
  private vlanId = 0;
  private pool = '';
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
    return { user: `${n}>`, priv: `${n}#`, config: `${n}(config)#`, if: `${n}(config-if${this.ifs.length > 1 ? '-range' : ''})#`, router: `${n}(config-router)#`, vlan: `${n}(config-vlan)#`, line: `${n}(config-line)#`, dhcp: `${n}(dhcp-config)#` }[this.mode] + ' ';
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
      this.mode = this.mode === 'if' || this.mode === 'router' || this.mode === 'vlan' || this.mode === 'line' || this.mode === 'dhcp' ? 'config' : this.mode === 'config' ? 'priv' : 'user';
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
    if (this.mode === 'router') return this.routerCmd(w, r, neg, has);
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
      this.mode = 'router';
      return '';
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
    if (has('ip', 'nat', 'inside', 'source')) {
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
    if (has('access-list') || has('ip', 'access-list') || has('service') || has('ip', 'domain-name') || has('no', 'ip', 'domain-lookup') || has('ip', 'dhcp', 'excluded-address') || has('logging') || has('ntp') || has('snmp-server') || has('username')) return '';
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
      if (has('shutdown')) set({ shutdown: !neg });
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
        set(w[2]?.startsWith('t') ? { mode: 'trunk', allowedVlans: i.allowedVlans ?? 'all', nativeVlan: i.nativeVlan ?? 1 } : { mode: 'access', vlan: i.vlan ?? 1 });
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
        else if (w[2] === 'ip' && isIp(r[3])) set({ hsrp: { ...h, group: g, vip: r[3] } });
        else if (w[2]?.startsWith('pri')) set({ hsrp: { ...h, group: g, priority: Number(w[3]) || 100 } });
        else if (w[2]?.startsWith('pre')) set({ hsrp: { ...h, group: g, preempt: true } });
        else return '% standby <group> ip <vip> | priority <n> | preempt';
      } else if (has('ip', 'nat')) set({ nat: neg ? undefined : w[2]?.startsWith('in') ? 'inside' : 'outside' });
      else if (has('ip', 'helper-address')) set({ helper: neg ? undefined : r[2] });
      else if (has('ip', 'ospf', 'cost')) set({ ospf: i.ospf ? { ...i.ospf, cost: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf', 'hello-interval')) set({ ospf: i.ospf ? { ...i.ospf, hello: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf', 'dead-interval')) set({ ospf: i.ospf ? { ...i.ospf, dead: neg ? undefined : Number(w[3]) } : i.ospf });
      else if (has('ip', 'ospf') && w[3]?.startsWith('area')) set({ ospf: neg ? undefined : { ...(i.ospf ?? {}), area: Number(w[4]) } });
      else if (has('mtu') || has('ip', 'mtu')) set({ mtu: neg ? undefined : Number(w.at(-1)) });
      else if (has('spanning-tree', 'portfast')) set({ portfast: !neg });
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
    if (s('interfaces', 'status') || s('int', 'status')) {
      const rows = d.interfaces.filter((i) => !i.parent && i.type !== 'console' && !/^vlan/i.test(i.name)).map((i) => {
        const c = cableOnPort(doc, d.id, i.name);
        const stt = c ? cableStatus(doc, c) : null;
        const status = i.shutdown ? 'disabled' : cp.l2.blocked.has(`${d.id}/${i.name}`) && cp.stp[d.id]?.ports[i.name]?.state === 'blocking' ? 'blocking' : !c ? 'notconnect' : stt!.state === 'down' ? 'notconnect' : 'connected';
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
      const head = 'Codes: C - connected, S - static, O - OSPF, IA - OSPF inter area, E2 - OSPF external type 2, * - candidate default\r\n';
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
      return [`VLAN0001 (common spanning tree for all VLANs)`, `  Spanning tree enabled protocol rstp`, `  Root ID    Priority    ${root?.priority}`, `             Address     ${root ? ciscoMac(root.mac) : ''}`, b.isRoot ? '             This bridge is the root' : `             Cost        ${b.rootCost}\r\n             Port        ${b.rootPort}`, ``, `  Bridge ID  Priority    ${b.priority}`, `             Address     ${ciscoMac(b.mac)}`, ``, `Interface           Role Sts Cost      Prio.Nbr Type`, `------------------- ---- --- --------- -------- ----`, ...Object.entries(b.ports).sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true })).map(([p, v]) => `${pad(p, 20)}${pad({ root: 'Root', designated: 'Desg', alternate: 'Altn', edge: 'Desg', disabled: 'Disb' }[v.role], 5)}${pad({ forwarding: 'FWD', blocking: 'BLK', disabled: 'DIS' }[v.state], 4)}${pad(String(v.cost), 10)}128.1    P2p${v.role === 'edge' ? ' Edge' : ''}`)].join('\r\n');
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
      return `Pro Inside global         Inside local          Outside local         Outside global\r\n${t.map((x) => `${pad(x.nat!.proto, 4)}${pad(x.nat!.outside, 22)}${pad(x.nat!.inside, 22)}${pad(x.request.dst, 22)}${x.request.dst}`).join('\r\n')}${t.length ? '' : '\r\n(no translations yet: send traffic from an inside host to the outside)'}`;
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
      return ['enable / disable / configure terminal / write memory', 'show running-config | startup-config | ip interface brief | interfaces status | interfaces <if>', 'show ip route | ip ospf neighbor | standby | ip nat translations | ip dhcp pool', 'show vlan | mac address-table | spanning-tree | etherchannel summary | cdp neighbors | arp | power inline', 'ping <ip|device> [repeat n]   traceroute <ip|device>'].join('\r\n');
    if (this.mode === 'config') return ['hostname <name>   interface <if> | interface range <if - n>   vlan <id> (name <n>)', 'ip route <net> <mask> <next-hop>   ip default-gateway <ip>   router ospf <pid>', 'spanning-tree vlan 1 priority <n> | root primary   no spanning-tree vlan 1', 'ip nat inside source list 1 interface <if> overload   ip dhcp pool <name>', 'enable secret <pw>   banner motd #text#   crypto key generate rsa   line vty 0 15 (transport input ssh)'].join('\r\n');
    if (this.mode === 'if') return ['ip address <ip> <mask> | ip address dhcp   [no] shutdown   description <text>', 'switchport mode access|trunk   switchport access vlan <n>   switchport trunk allowed vlan <list|add|remove>', 'switchport trunk native vlan <n>   speed <10|100|1000|auto>   duplex <full|half|auto>   mtu <bytes>', 'channel-group <n> mode active|passive|on|desirable|auto   spanning-tree portfast', 'standby <g> ip <vip> | priority <n> | preempt   ip nat inside|outside   ip helper-address <ip>', 'ip ospf <pid> area <a>   ip ospf cost|hello-interval|dead-interval <n>   encapsulation dot1Q <vlan>'].join('\r\n');
    if (this.mode === 'router') return 'network <ip> <wildcard> area <a>   router-id <ip>   passive-interface <if>   default-information originate';
    if (this.mode === 'dhcp') return 'network <ip> <mask>   default-router <ip>   dns-server <ip>';
    return 'exit / end';
  }
}

function intToIpLocal(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export { dhcpLease };
