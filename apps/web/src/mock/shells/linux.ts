import { ipConfig, isServiceUp, resolveName } from '../lab';
import { pingOutput, tcpTest, type Shell, type ShellCtx, type ShellResult } from './common';

export class LinuxShell implements Shell {
  constructor(
    private ctx: ShellCtx,
    private recentAlerts: () => { at: string; rule: string; level: number; agent: string }[] = () => [],
  ) {}

  banner() {
    return `Ubuntu 24.04.3 LTS ${this.ctx.node.toLowerCase()} tty1\n\nLast login from 10.10.10.40 (jump host). Session recorded.\nType 'help' for common commands on this host.\n`;
  }
  prompt() {
    return `${this.ctx.operator}@${this.ctx.node.toLowerCase()}:~$ `;
  }

  private svcList(): Record<string, 'Running' | 'Stopped'> {
    return this.ctx.lab.nodes[this.ctx.node].services ?? {};
  }

  exec(line: string): ShellResult {
    const raw = line.trim().replace(/^sudo\s+/, '');
    const t = raw.split(/\s+/);
    const o = (s: string): ShellResult => ({ output: s });
    const { lab, node } = this.ctx;
    const c = ipConfig(lab, node);
    switch (t[0]) {
      case '':
        return o('');
      case 'help':
        return o(['ip a | ip route | ping <host> | dig <name> | cat /etc/resolv.conf', 'curl -k https://<host>/health | nc -zv <host> <port> | ss -tlnp', 'systemctl status|start|stop|restart <svc> | journalctl -u <svc> -n 20', ...(node === 'DB01' ? ['psql -c "select count(*) from payments.transactions"'] : []), ...(node === 'WAZUH01' ? ['tail /var/ossec/logs/alerts/alerts.log'] : []), `services here: ${Object.keys(this.svcList()).join(', ') || 'none'}`].join('\n'));
      case 'hostname':
        return o(node.toLowerCase());
      case 'whoami':
        return o(this.ctx.operator);
      case 'ip':
        if (t[1]?.startsWith('r')) return o(`default via ${c.gw} dev ens18 proto static\n${c.ip.replace(/\.\d+$/, '.0')}/24 dev ens18 proto kernel scope link src ${c.ip}`);
        return o(`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: ens18: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP\n    link/ether 52:54:00:3a:${node.length.toString(16).padStart(2, '0')}:1f brd ff:ff:ff:ff:ff:ff\n    inet ${c.ip}/24 brd ${c.ip.replace(/\.\d+$/, '.255')} scope global ens18`);
      case 'ping':
        return o(pingOutput(this.ctx, t.filter((x) => !x.startsWith('-') && !/^\d+$/.test(x))[1] ?? '', 'unix', 3));
      case 'cat':
        if (t[1] === '/etc/resolv.conf') return o(`nameserver ${c.dns[0] ?? ''}\nnameserver ${c.dns[1] ?? ''}\nsearch corp.salonemutual.lab`);
        return o(`cat: ${t[1]}: No such file or directory`);
      case 'dig':
      case 'nslookup':
      case 'host': {
        const r = resolveName(lab, node, t[1] ?? '');
        if (!r.ok) return o(r.reason === 'nxdomain' ? `;; ->>HEADER<<- status: NXDOMAIN\n;; SERVER: ${r.server}#53` : ';; connection timed out; no servers could be reached');
        return o(`;; ANSWER SECTION:\n${t[1]}.\t3600\tIN\tA\t${r.ip}\n\n;; SERVER: ${r.server}#53(${r.server}) (UDP)`);
      }
      case 'curl': {
        const url = t.find((x) => /^https?:\/\//.test(x)) ?? '';
        const m = /^https?:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
        if (!m) return o('curl: (3) URL using bad/illegal format or missing URL');
        const port = Number(m[2] ?? (url.startsWith('https') ? 443 : 80));
        const r = tcpTest(this.ctx, m[1], port);
        if (!r.ok) return o(r.ip ? `curl: (28) Failed to connect to ${m[1]} port ${port}: ${r.detail}` : `curl: (6) Could not resolve host: ${m[1]}`);
        const dbOk = isServiceUp(lab, 'DB01', 'postgresql');
        return o(m[3]?.includes('health') ? JSON.stringify({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'unreachable', version: '1.8.2' }) : '<!doctype html><title>SalonePay</title>...');
      }
      case 'nc': {
        const host = t.filter((x) => !x.startsWith('-'))[1];
        const port = Number(t.filter((x) => !x.startsWith('-'))[2]);
        const r = tcpTest(this.ctx, host ?? '', port);
        return o(r.ok ? `Connection to ${host} (${r.ip}) ${port} port [tcp/*] succeeded!` : `nc: connect to ${host} port ${port} (tcp) failed: ${r.detail}`);
      }
      case 'ss':
        return o(['State   Recv-Q Send-Q Local Address:Port   Process', ...Object.entries(this.svcList()).filter(([, s]) => s === 'Running').map(([n]) => `LISTEN  0      511    0.0.0.0:${{ nginx: 443, postgresql: 5432, salonepay: 8080, 'wazuh-manager': 1514, 'wazuh-indexer': 9200 }[n] ?? 0}        users:(("${n}"))`)].join('\n'));
      case 'systemctl': {
        const action = t[1];
        const svc = (t[2] ?? '').replace(/\.service$/, '');
        const svcs = this.ctx.lab.nodes[node].services;
        if (!svcs || !(svc in svcs)) return o(`Unit ${svc}.service could not be found.`);
        if (action === 'status') return o(`● ${svc}.service\n     Loaded: loaded (/etc/systemd/system/${svc}.service; enabled)\n     Active: ${svcs[svc] === 'Running' ? 'active (running)' : 'inactive (dead)'} since ${new Date(Date.now() - 3.6e6).toUTCString()}`);
        if (['start', 'stop', 'restart'].includes(action)) {
          svcs[svc] = action === 'stop' ? 'Stopped' : 'Running';
          this.ctx.changed(`systemctl ${action} ${svc}`);
          return o('');
        }
        return o(`Unknown command verb ${action}.`);
      }
      case 'journalctl': {
        const svc = t[t.indexOf('-u') + 1] ?? '';
        if (svc.startsWith('salonepay')) {
          const db = tcpTest(this.ctx, '10.10.40.10', 5432);
          return o(db.ok ? '... INFO  request served path=/api/transfers status=200 ms=41\n... INFO  pool size=20 in_use=6' : `... ERROR db connection failed: ${db.detail}\n... WARN  returning 503 to client`);
        }
        return o(`-- No entries for ${svc} --`);
      }
      case 'psql':
        if (node !== 'DB01') return o('psql: command not found');
        return o(' count\n--------\n 184213\n(1 row)');
      case 'tail':
        if (node === 'WAZUH01' && raw.includes('alerts')) {
          const rows = this.recentAlerts().slice(-10);
          return o(rows.length ? rows.map((a) => `** Alert ${new Date(a.at).getTime() / 1000}: - ${a.agent}\nRule: ${a.level} - '${a.rule}'`).join('\n') : 'No alerts in the last hour.');
        }
        return o(`tail: cannot open '${t[1]}' for reading: No such file or directory`);
    }
    return o(`${t[0]}: command not found`);
  }
}
