import { duplexMismatch, effectiveSpeed, type PortCfg } from '../lab';
import { pad, pingOutput, type Shell, type ShellCtx, type ShellResult } from './common';

type Mode = 'user' | 'exec' | 'config' | 'config-if';

/** Each word of `pattern` must be matched by an unambiguous prefix (Cisco-style abbreviations). */
function match(tokens: string[], pattern: string): boolean {
  const words = pattern.split(' ');
  if (tokens.length < words.length) return false;
  return words.every((w, i) => {
    const t = tokens[i].toLowerCase();
    return t.length >= Math.min(2, w.length) && w.startsWith(t);
  });
}

export function normIf(raw: string): string | null {
  const m = /^(?:gi(?:g(?:abit(?:ethernet)?)?)?|g)\s*(\d+\/\d+)$/i.exec(raw.replace(/\s+/g, ''));
  return m ? `Gi${m[1]}` : null;
}

export class IosShell implements Shell {
  private mode: Mode = 'user';
  private iface: string | null = null;
  private isRouter: boolean;
  constructor(private ctx: ShellCtx) {
    this.isRouter = ctx.node === 'BO-RTR01';
  }

  banner() {
    return `\n${this.ctx.node} - authorized access only. All sessions are recorded.\n\nUser Access Verification\nUsername: ${this.ctx.operator}\nPassword:\n`;
  }
  prompt() {
    const h = this.ctx.node;
    return { user: `${h}>`, exec: `${h}#`, config: `${h}(config)#`, 'config-if': `${h}(config-if)#` }[this.mode];
  }

  exec(line: string): ShellResult {
    const raw = line.trim();
    if (!raw) return { output: '' };
    const t = raw.split(/\s+/);
    const o = (s: string): ShellResult => ({ output: s });
    if (raw === '?' || match(t, 'help')) return o(this.help());
    // `do` lets config modes run exec commands
    if (t[0].toLowerCase() === 'do' && this.mode.startsWith('config')) return this.execMode(t.slice(1));
    if (match(t, 'end') || raw === '^Z') {
      if (this.mode.startsWith('config')) {
        this.mode = 'exec';
        this.iface = null;
        return o('');
      }
    }
    if (match(t, 'exit')) {
      if (this.mode === 'config-if') this.mode = 'config';
      else if (this.mode === 'config') this.mode = 'exec';
      else return o('Connection closed by foreign host.');
      this.iface = null;
      return o('');
    }
    if (this.mode === 'user') {
      if (match(t, 'enable')) {
        this.mode = 'exec';
        return o('Password:');
      }
      if (t[0].toLowerCase().startsWith('sh') || t[0].toLowerCase() === 'ping') return this.execMode(t);
      return o('% Unknown command or not allowed in user mode. Type "enable" first.');
    }
    if (this.mode === 'exec') return this.execMode(t);
    if (this.mode === 'config') return this.configMode(t);
    return this.ifMode(t);
  }

  private help(): string {
    if (this.mode === 'config') return 'Configure commands:\n  interface <Gi0/n>     Select an interface to configure\n  vlan <n>              VLAN configuration\n  end                   Exit to privileged EXEC\n  do <exec command>     Run an exec command from config mode';
    if (this.mode === 'config-if') return 'Interface commands:\n  switchport mode access|trunk\n  switchport access vlan <n>\n  duplex auto|full|half\n  speed auto|100|1000\n  description <text>\n  shutdown | no shutdown\n  exit | end';
    const sw = this.isRouter
      ? ['show ip interface brief', 'show ip route', 'show interfaces wg0', 'show running-config', 'ping <host>']
      : ['show interfaces status', 'show interfaces <Gi0/n>', 'show interfaces counters errors', 'show vlan brief', 'show running-config interface <Gi0/n>', 'show mac address-table', 'clear counters [Gi0/n]', 'configure terminal', 'copy running-config startup-config | write memory', 'ping <host>'];
    return ['Exec commands:', ...sw.map((s) => `  ${s}`), this.mode === 'user' ? '  enable                Enter privileged mode' : ''].join('\n');
  }

  private ports(): PortCfg[] {
    return Object.values(this.ctx.lab.switchPorts).sort((a, b) => Number(a.name.split('/')[1]) - Number(b.name.split('/')[1]));
  }

  private execMode(t: string[]): ShellResult {
    const o = (s: string): ShellResult => ({ output: s });
    const { lab } = this.ctx;
    if (match(t, 'configure terminal') || (t.length === 1 && match(t, 'configure'))) {
      if (this.mode === 'user') return o('% Invalid input: enter "enable" first');
      this.mode = 'config';
      return o('Enter configuration commands, one per line.  End with CNTL/Z.');
    }
    if (t[0].toLowerCase() === 'ping') return o(pingOutput(this.ctx, t[1] ?? '', 'ios'));
    if (match(t, 'write memory') || match(t, 'copy running-config startup-config') || (t.length === 1 && match(t, 'write'))) {
      this.ctx.changed('Saved running-config to startup-config');
      return o('Building configuration...\n[OK]');
    }
    if (this.isRouter) return o(this.routerShow(t));
    if (match(t, 'show interfaces status')) {
      const rows = this.ports().map((p) => {
        const connected = !p.shutdown && !!p.peer;
        const dup = p.duplex === 'auto' ? 'a-full' : p.duplex;
        const spd = p.speed === 'auto' ? 'a-1000' : p.speed;
        return `${pad(p.name, 9)} ${pad(p.description, 18)} ${pad(p.shutdown ? 'disabled' : connected ? 'connected' : 'notconnect', 12)} ${pad(p.mode === 'trunk' ? 'trunk' : p.vlan, 10)} ${pad(dup, 7)} ${pad(spd, 6)} 10/100/1000BaseTX`;
      });
      return o(['Port      Name               Status       Vlan       Duplex  Speed  Type', ...rows].join('\n'));
    }
    if (match(t, 'show interfaces counters errors')) {
      return o(['Port        Align-Err    FCS-Err   Xmit-Err    Rcv-Err  UnderSize  OutDiscards', ...this.ports().filter((p) => p.peer).map((p) => `${pad(p.name, 12)}${pad(0, 13)}${pad(p.crc, 10)}${pad(0, 12)}${pad(p.inputErrors, 9)}${pad(0, 11)}0`), '', 'Port      Single-Col  Multi-Col   Late-Col  Excess-Col', ...this.ports().filter((p) => p.peer).map((p) => `${pad(p.name, 10)}${pad(p.lateCollisions ? Math.round(p.lateCollisions * 1.7) : 0, 12)}${pad(p.lateCollisions ? Math.round(p.lateCollisions * 0.8) : 0, 12)}${pad(p.lateCollisions, 10)}0`)].join('\n'));
    }
    if (match(t, 'show interfaces') && t[2]) {
      const n = normIf(t.slice(2).join(''));
      const p = n ? lab.switchPorts[n] : undefined;
      if (!p) return o('% Invalid input detected at ^ marker. Use an interface such as Gi0/3');
      return o(this.showInterface(p));
    }
    if (match(t, 'show vlan brief') || match(t, 'show vlan')) {
      const rows = Object.entries(lab.vlans).map(([id, name]) => {
        const ps = this.ports().filter((p) => p.mode === 'access' && p.vlan === Number(id) && !p.shutdown).map((p) => p.name);
        return `${pad(id, 5)}${pad(name, 33)}${pad('active', 10)}${ps.join(', ')}`;
      });
      return o(['VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------', ...rows].join('\n'));
    }
    if (match(t, 'show running-config interface') && t[3]) {
      const n = normIf(t.slice(3).join(''));
      const p = n ? lab.switchPorts[n] : undefined;
      if (!p) return o('% Invalid interface');
      return o(this.runIf(p));
    }
    if (match(t, 'show running-config')) {
      return o(['Building configuration...', '', `hostname ${this.ctx.node}`, '!', 'spanning-tree mode rapid-pvst', '!', ...this.ports().map((p) => this.runIf(p)), '!', 'ip default-gateway 10.10.10.1', 'logging host 10.10.50.10', 'end'].join('\n'));
    }
    if (match(t, 'show mac address-table')) {
      const macs = this.ports().filter((p) => p.peer && !p.shutdown && p.mode === 'access').map((p, i) => `${pad(p.vlan, 5)}${pad(`5254.00${(10 + i).toString(16)}.${(4096 + i * 17).toString(16)}`, 18)}DYNAMIC     ${p.name}`);
      return o(['          Mac Address Table', '-------------------------------------------', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----', ...macs].join('\n'));
    }
    if (match(t, 'clear counters')) {
      const n = t[2] ? normIf(t.slice(2).join('')) : null;
      for (const p of this.ports()) {
        if (n && p.name !== n) continue;
        p.crc = 0;
        p.lateCollisions = 0;
        p.inputErrors = 0;
      }
      lab.counters.switchClearedAt = new Date().toISOString();
      this.ctx.changed(`Cleared counters${n ? ` on ${n}` : ''}`);
      return o(`Clear "show interface" counters on ${n ?? 'all interfaces'} [confirm]\n[OK]`);
    }
    return o(`% Invalid input detected at '^' marker.\n${t.join(' ')}\n^`);
  }

  private showInterface(p: PortCfg): string {
    const up = !p.shutdown && !!p.peer;
    const mismatch = duplexMismatch(this.ctx.lab, p.name);
    const dup = p.duplex === 'auto' ? 'Full-duplex' : p.duplex === 'full' ? 'Full-duplex' : 'Half-duplex';
    const spd = effectiveSpeed(p) === '1000' ? '1000Mb/s' : '100Mb/s';
    const rate = up ? (mismatch ? 1840000 : 48200000) : 0;
    return [
      `GigabitEthernet${p.name.slice(2)} is ${p.shutdown ? 'administratively down' : up ? 'up' : 'down'}, line protocol is ${up ? 'up (connected)' : 'down (notconnect)'}`,
      `  Hardware is Gigabit Ethernet, address is 5254.0012.34${p.name.split('/')[1].padStart(2, '0')}`,
      `  Description: ${p.description}`,
      `  MTU 1500 bytes, BW ${effectiveSpeed(p) === '1000' ? 1000000 : 100000} Kbit/sec, DLY 10 usec,`,
      `  ${dup}, ${spd}, media type is 10/100/1000BaseTX${p.duplex !== 'auto' || p.speed !== 'auto' ? ' (forced)' : ' (auto-negotiated)'}`,
      `  input flow-control is off, output flow-control is unsupported`,
      `  5 minute input rate ${Math.round(rate * 0.6)} bits/sec, ${Math.round(rate / 9000)} packets/sec`,
      `  5 minute output rate ${rate} bits/sec, ${Math.round(rate / 8000)} packets/sec`,
      `     ${Math.round(rate * 3)} packets input, ${Math.round(rate * 900)} bytes, 0 no buffer`,
      `     ${p.inputErrors} input errors, ${p.crc} CRC, 0 frame, 0 overrun, 0 ignored`,
      `     0 output errors, ${Math.round(p.lateCollisions * 2.5)} collisions, 0 interface resets`,
      `     ${p.lateCollisions} late collision, 0 deferred`,
    ].join('\n');
  }

  private runIf(p: PortCfg): string {
    const l = [`interface GigabitEthernet${p.name.slice(2)}`];
    if (p.description) l.push(` description ${p.description}`);
    if (p.mode === 'trunk') l.push(' switchport mode trunk');
    else l.push(` switchport access vlan ${p.vlan}`, ' switchport mode access');
    if (p.duplex !== 'auto') l.push(` duplex ${p.duplex}`);
    if (p.speed !== 'auto') l.push(` speed ${p.speed}`);
    if (p.shutdown) l.push(' shutdown');
    return l.join('\n');
  }

  private configMode(t: string[]): ShellResult {
    if (match(t, 'interface') && t[1]) {
      const n = normIf(t.slice(1).join(''));
      if (!n || !this.ctx.lab.switchPorts[n]) return { output: '% Invalid interface. Use e.g. interface Gi0/12' };
      this.iface = n;
      this.mode = 'config-if';
      return { output: '' };
    }
    if (match(t, 'vlan') && t[1]) return { output: `% VLAN ${t[1]} exists. VLAN changes are managed through NetBox in this lab.` };
    if (/^(show|ping|clear|write|copy)/i.test(t[0])) return { output: '% Use "do" to run exec commands in config mode, e.g. do show interfaces status' };
    return { output: `% Invalid input detected at '^' marker.` };
  }

  private ifMode(t: string[]): ShellResult {
    const p = this.ctx.lab.switchPorts[this.iface!];
    const ch = (what: string): ShellResult => {
      this.ctx.changed(`${p.name}: ${what}`);
      return { output: '' };
    };
    if (match(t, 'switchport access vlan') && t[3]) {
      const v = Number(t[3]);
      if (!this.ctx.lab.vlans[v]) return { output: `% VLAN ${t[3]} does not exist` };
      p.vlan = v;
      return ch(`access VLAN ${v}`);
    }
    if (match(t, 'switchport mode access')) {
      p.mode = 'access';
      return ch('mode access');
    }
    if (match(t, 'switchport mode trunk')) {
      p.mode = 'trunk';
      return ch('mode trunk');
    }
    if (match(t, 'duplex') && t[1]) {
      const d = t[1].toLowerCase();
      const v = (['auto', 'full', 'half'] as const).find((x) => x.startsWith(d));
      if (!v) return { output: '% Invalid duplex. Use auto, full or half' };
      p.duplex = v;
      return ch(`duplex ${v}`);
    }
    if (match(t, 'speed') && t[1]) {
      const s = t[1].toLowerCase();
      const v = (['auto', '100', '1000'] as const).find((x) => x === s || x.startsWith(s));
      if (!v) return { output: '% Invalid speed. Use auto, 100 or 1000' };
      p.speed = v;
      return ch(`speed ${v}`);
    }
    if (match(t, 'description')) {
      p.description = t.slice(1).join(' ');
      return ch(`description "${p.description}"`);
    }
    if (match(t, 'no shutdown')) {
      p.shutdown = false;
      return { output: `%LINK-3-UPDOWN: Interface GigabitEthernet${p.name.slice(2)}, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet${p.name.slice(2)}, changed state to up${(this.ctx.changed(`${p.name}: no shutdown`), '')}` };
    }
    if (match(t, 'shutdown')) {
      p.shutdown = true;
      return { output: `%LINK-5-CHANGED: Interface GigabitEthernet${p.name.slice(2)}, changed state to administratively down${(this.ctx.changed(`${p.name}: shutdown`), '')}` };
    }
    if (match(t, 'interface') && t[1]) return this.configMode(t);
    return { output: "% Invalid input detected at '^' marker." };
  }

  private routerShow(t: string[]): string {
    if (match(t, 'show ip interface brief')) return 'Interface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet0/0     196.216.4.18    YES DHCP   up                    up\nGigabitEthernet0/1     10.20.0.1       YES NVRAM  up                    up\nwg0                    10.255.255.2    YES manual up                    up';
    if (match(t, 'show ip route')) return 'Codes: L - local, C - connected, S - static\n\nGateway of last resort is 196.216.4.1 to network 0.0.0.0\n\nS*    0.0.0.0/0 [1/0] via 196.216.4.1\n      10.0.0.0/8 is variably subnetted\nS        10.10.0.0/16 [1/0] via 10.255.255.1, wg0\nC        10.20.0.0/16 is directly connected, GigabitEthernet0/1\nS        10.30.0.0/16 [1/0] via 10.255.255.1, wg0';
    if (match(t, 'show interfaces') && t[2]?.toLowerCase().startsWith('wg')) return 'wg0 is up, line protocol is up\n  Hardware is WireGuard tunnel\n  Peer: 102.176.65.10:51820 (FW01), latest handshake: 41 seconds ago\n  Transfer: 2.31 GiB received, 690 MiB sent\n  Simulated WAN: 38 ms latency, 0.5% loss (tc netem)';
    if (match(t, 'show running-config')) return 'hostname BO-RTR01\n!\ninterface GigabitEthernet0/1\n ip address 10.20.0.1 255.255.0.0\n!\ninterface wg0\n ip address 10.255.255.2 255.255.255.252\n!\nip route 10.10.0.0 255.255.0.0 10.255.255.1\nip route 10.30.0.0 255.255.0.0 10.255.255.1\nend';
    return `% Invalid input detected at '^' marker.`;
  }
}
