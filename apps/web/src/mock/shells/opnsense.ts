import { evalFirewall, ipConfig, nodeByIp, type FwRule } from '../lab';
import { pad, pingOutput, type Shell, type ShellCtx, type ShellResult } from './common';

/** Small OPNsense admin CLI over the firewall's rule set. Edits are staged until `rules apply`. */
export class OpnsenseShell implements Shell {
  constructor(private ctx: ShellCtx) {}

  banner() {
    return `\n*** ${this.ctx.node}.mgmt.salonemutual.lab: OPNsense 25.7 (amd64) ***\n\n LAN (vtnet1)    -> v4: 10.10.10.1/24\n VLAN20 USERS    -> v4: 10.10.20.1/24\n VLAN30 SERVERS  -> v4: 10.10.30.1/24\n VLAN40 DATABASE -> v4: 10.10.40.1/24\n WAN (vtnet0)    -> v4/DHCP4: 102.176.65.10/28\n\nType 'help' for the lab rule commands.\n`;
  }
  prompt() {
    return `root@${this.ctx.node}:~ # `;
  }

  private rules(): FwRule[] {
    return this.ctx.lab.fwPending ?? this.ctx.lab.fwRules;
  }
  private stage(): FwRule[] {
    if (!this.ctx.lab.fwPending) this.ctx.lab.fwPending = structuredClone(this.ctx.lab.fwRules);
    return this.ctx.lab.fwPending;
  }

  private table(rs: FwRule[]): string {
    return [
      ' ID  IFACE   ACTION  PROTO    SOURCE          DESTINATION     PORT                     LOG  STATE     DESCRIPTION',
      ...rs.map((r) => ` ${pad(r.id, 4)}${pad(r.iface, 8)}${pad(r.action, 8)}${pad(r.proto, 9)}${pad(r.src, 16)}${pad(r.dst, 16)}${pad(r.port, 25)}${pad(r.log ? 'yes' : 'no', 5)}${pad(r.enabled ? 'enabled' : 'disabled', 10)}${r.descr}`),
    ].join('\n');
  }

  exec(line: string): ShellResult {
    const t = line.trim().split(/\s+/);
    const o = (s: string): ShellResult => ({ output: s });
    const c = t[0]?.toLowerCase();
    if (!c) return o('');
    const { lab } = this.ctx;
    if (c === 'help' || c === '?')
      return o(['Lab rule commands (changes are staged until you apply them):', '  rules list [VLAN20]          list rules (first match wins, top to bottom)', '  rules show <id>              one rule in detail', '  rules disable|enable <id>    stage a change', '  rules delete <id>            stage a deletion', '  rules diff                   staged vs running', '  rules apply                  push staged changes (filter reload)', '  rules revert                 drop staged changes', '  rules test <src-ip> <dst-ip> <port>   which rule would match', '  log denied [n]               recent blocked connections (default deny is logged)', '  pfctl -sr                    running ruleset', '  ping <host>'].join('\n'));
    if (c === 'ping') return o(pingOutput(this.ctx, t[1] ?? '', 'unix', 3));
    if (c === 'pfctl') return o(lab.fwRules.filter((r) => r.enabled).map((r) => `${r.action} ${r.log ? 'log ' : ''}quick on ${r.iface.toLowerCase()} proto ${r.proto} from ${r.src} to ${r.dst}${r.port !== 'any' ? ` port { ${r.port} }` : ''} label "${r.descr}"`).join('\n'));
    if (c === 'log' && t[1]?.toLowerCase().startsWith('den')) {
      const n = Number(t[2] ?? 15);
      const rows = lab.fwDenyLog.slice(-n).reverse();
      if (!rows.length) return o('No blocked connections logged yet.');
      return o(['TIME      RULE  SOURCE          DESTINATION     PORT', ...rows.map((r) => `${new Date(r.at).toLocaleTimeString().padEnd(10)}${pad(r.rule, 6)}${pad(r.src, 16)}${pad(r.dst, 16)}${r.port}`)].join('\n'));
    }
    if (c !== 'rules') return o(`${t[0]}: Command not found. Type 'help'.`);
    const sub = t[1]?.toLowerCase() ?? 'list';
    const id = Number(t[2]);
    switch (sub) {
      case 'list': {
        const rs = this.rules().filter((r) => !t[2] || r.iface.toLowerCase() === t[2].toLowerCase() || r.iface === 'any');
        return o(`${lab.fwPending ? '(showing STAGED rules, not yet applied: run "rules apply")\n' : ''}${this.table(rs)}`);
      }
      case 'show': {
        const r = this.rules().find((x) => x.id === id);
        if (!r) return o(`No rule with id ${t[2]}.`);
        return o(Object.entries(r).map(([k, v]) => `${pad(k, 8)}: ${v}`).join('\n'));
      }
      case 'disable':
      case 'enable':
      case 'delete': {
        const rs = this.stage();
        const i = rs.findIndex((x) => x.id === id);
        if (i < 0) return o(`No rule with id ${t[2]}.`);
        if (rs[i].id === 99 && sub !== 'enable') return o('Rule 99 is the default deny. It cannot be removed in this lab.');
        if (sub === 'delete') rs.splice(i, 1);
        else rs[i].enabled = sub === 'enable';
        return o(`Rule ${id} ${sub}d (staged). Run "rules apply" to push the change.`);
      }
      case 'diff': {
        if (!lab.fwPending) return o('No staged changes.');
        const run = new Map(lab.fwRules.map((r) => [r.id, r]));
        const stg = new Map(lab.fwPending.map((r) => [r.id, r]));
        const lines: string[] = [];
        for (const [k, r] of run) {
          const s = stg.get(k);
          if (!s) lines.push(`- ${k} ${r.descr}`);
          else if (s.enabled !== r.enabled) lines.push(`~ ${k} ${r.descr}: ${r.enabled ? 'enabled' : 'disabled'} -> ${s.enabled ? 'enabled' : 'disabled'}`);
        }
        return o(lines.length ? lines.join('\n') : 'No differences.');
      }
      case 'apply': {
        if (!lab.fwPending) return o('Nothing to apply.');
        lab.fwRules = lab.fwPending;
        lab.fwPending = null;
        this.ctx.changed('Firewall rules applied (filter reload)');
        return o('Reloading filter... done.\nConfiguration applied. Change recorded in the change log.');
      }
      case 'revert':
        lab.fwPending = null;
        return o('Staged changes discarded.');
      case 'test': {
        const [src, dst, port] = [t[2], t[3], Number(t[4])];
        if (!src || !dst || !port) return o('Usage: rules test <src-ip> <dst-ip> <port>');
        const v = evalFirewall(lab, src, dst, port, 'tcp');
        const sn = nodeByIp(lab, src) ?? src;
        const dn = nodeByIp(lab, dst) ?? dst;
        return o(`${sn} -> ${dn}:${port}  =>  ${v.action.toUpperCase()} by rule ${v.rule.id} (${v.rule.descr})`);
      }
    }
    return o(`rules: unknown subcommand '${t[1]}'. Type 'help'.`);
  }
}

export { ipConfig };
