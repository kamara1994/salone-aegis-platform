import { anyLogonServer, computeLease, hasAccess, ipConfig, isServiceUp, nodeByName, renewLease, type AdUser } from '../lab';
import { hasFlag, nslookupOutput, pad, param, pingOutput, positional, tcpTest, tokenize, tracertOutput, type Shell, type ShellCtx, type ShellResult } from './common';

const DC_CMDS = [
  'Get-ADUser <id> [-Properties *]', 'New-ADUser -Name <name> -SamAccountName <sam> -Path "OU=Finance,OU=Staff"', 'Enable-ADAccount -Identity <sam>',
  'Disable-ADAccount -Identity <sam>', 'Unlock-ADAccount -Identity <sam>', 'Set-ADAccountPassword -Identity <sam> -Reset',
  'Add-ADGroupMember -Identity <group> -Members <sam>', 'Remove-ADGroupMember -Identity <group> -Members <sam>', 'Get-ADGroupMember <group>',
  'Get-ADPrincipalGroupMembership <sam>', 'Get-ADGroup -Filter *', 'Search-ADAccount -LockedOut',
  "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740}", "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4771}",
  'Get-AegisMfa -Identity <sam>', 'Enable-AegisMfa -Identity <sam>', 'Reset-AegisMfa -Identity <sam> -Device <device>',
];
const DHCP_CMDS = ['Get-DhcpServerv4Scope', 'Get-DhcpServerv4OptionValue -ScopeId <scope>', 'Set-DhcpServerv4OptionValue -ScopeId <scope> -DnsServer <ip>,<ip> [-Router <ip>]'];
const COMMON = [
  'ipconfig [/all | /renew | /release | /flushdns]', 'ping <host>', 'nslookup <name>', 'tracert <host>', 'Test-NetConnection <host> -Port <n>',
  'route print', 'netsh interface ipv4 set address name="Ethernet" static <ip> <mask> <gw> | source=dhcp', 'netsh interface ipv4 set dnsservers name="Ethernet" static <ip> primary | source=dhcp',
  'Get-NetIPConfiguration', 'Get-Service [name]', 'Start-Service <name>', 'Stop-Service <name>', 'Restart-Service <name>', 'hostname', 'whoami [/groups]', 'klist [purge]', 'gpupdate /force',
];

export class WindowsShell implements Shell {
  constructor(private ctx: ShellCtx) {}

  banner() {
    const sn = nodeByName(this.ctx.node)!;
    return `Windows PowerShell\nConnected to ${this.ctx.node} (${sn.role}) as CORP\\${this.ctx.operator}\nType 'help' for the commands available on this host.\n`;
  }
  prompt() {
    return `PS C:\\Users\\${this.ctx.operator}> `;
  }

  private isDC() {
    return this.ctx.node === 'DC01' || this.ctx.node === 'DC02';
  }

  exec(line: string): ShellResult {
    const args = tokenize(line.trim());
    if (!args.length) return { output: '' };
    const cmd = args[0].toLowerCase();
    const rest = args.slice(1);
    const out = (s: string): ShellResult => ({ output: s });
    try {
      switch (cmd) {
        case 'help':
        case 'get-help':
        case '?': {
          const lines = ['Commands on this host:', ...COMMON.map((c) => `  ${c}`)];
          if (this.isDC()) lines.push('', 'Active Directory and identity (Tier 0):', ...DC_CMDS.map((c) => `  ${c}`));
          if (this.ctx.node === 'DC01') lines.push('', 'DHCP:', ...DHCP_CMDS.map((c) => `  ${c}`));
          if (this.ctx.node === 'BKP01') lines.push('', 'Backup agent:', '  sc.exe query BackupAgent', '  sc.exe config BackupAgent obj= CORP\\svc-backup password= <password>', '  Get-Content C:\\ProgramData\\BackupAgent\\agent.log -Tail 20');
          if (this.ctx.node === 'FS01') lines.push('', 'File server:', '  Get-SmbShare', '  Get-SmbShareAccess -Name <share>', '  icacls D:\\Shares\\<share>');
          return out(lines.join('\n'));
        }
        case 'hostname':
          return out(this.ctx.node);
        case 'whoami':
          if (rest[0]?.toLowerCase() === '/groups') return out(this.whoamiGroups(this.ctx.operator));
          return out(`corp\\${this.ctx.operator}`);
        case 'ipconfig':
          return out(this.ipconfig(rest[0]?.toLowerCase()));
        case 'ping':
          return out(pingOutput(this.ctx, positional(rest) ?? '', 'windows', Number(param(rest, 'n') ?? 4)));
        case 'nslookup':
          return out(nslookupOutput(this.ctx, rest[0] ?? ''));
        case 'tracert':
          return out(tracertOutput(this.ctx, rest[0] ?? ''));
        case 'test-netconnection':
        case 'tnc':
          return out(this.tnc(rest));
        case 'route':
          return out(this.routePrint());
        case 'get-netipconfiguration':
          return out(this.getNetIp());
        case 'netsh':
          return out(this.netsh(rest));
        case 'get-service':
          return out(this.getService(positional(rest) ?? param(rest, 'Name')));
        case 'start-service':
        case 'stop-service':
        case 'restart-service':
          return out(this.setService(cmd, positional(rest) ?? param(rest, 'Name') ?? ''));
        case 'klist':
          if (rest[0]?.toLowerCase() === 'purge') {
            return out('Current LogonId is 0:0x3e4a1\n\tDeleting all tickets:\n\tTicket(s) purged!');
          }
          return out(`Current LogonId is 0:0x3e4a1\n\nCached Tickets: (2)\n\n#0>\tClient: ${this.ctx.operator} @ CORP.SALONEMUTUAL.LAB\n\tServer: krbtgt/CORP.SALONEMUTUAL.LAB @ CORP.SALONEMUTUAL.LAB\n#1>\tClient: ${this.ctx.operator} @ CORP.SALONEMUTUAL.LAB\n\tServer: cifs/fs01.corp.salonemutual.lab @ CORP.SALONEMUTUAL.LAB`);
        case 'gpupdate':
          if (!anyLogonServer(this.ctx.lab)) return out('Updating policy...\n\nComputer policy could not be updated successfully. The processing of Group Policy failed because of lack of network connectivity to a domain controller.');
          return out('Updating policy...\n\nComputer Policy update has completed successfully.\nUser Policy update has completed successfully.');
        case 'sc.exe':
        case 'sc':
          return out(this.sc(rest));
        case 'get-content':
        case 'type':
        case 'cat':
          return out(this.getContent(rest));
        case 'get-smbshare':
          return out(this.ctx.node !== 'FS01' ? this.notHere(args[0]) : 'Name     ScopeName Path                Description\n----     --------- ----                -----------\nFinance  *         D:\\Shares\\Finance    Finance department\nOperations *       D:\\Shares\\Operations Operations\nHR       *         D:\\Shares\\HR         HR (restricted)\nIPC$     *                             Remote IPC');
        case 'get-smbshareaccess':
          return out(this.ctx.node !== 'FS01' ? this.notHere(args[0]) : `Name    AccountName           AccessControlType AccessRight\n----    -----------           ----------------- -----------\n${param(rest, 'Name') ?? 'Finance'} CORP\\GG-AllStaff     Allow             Full`);
        case 'icacls':
          return out(this.ctx.node !== 'FS01' ? this.notHere(args[0]) : this.icacls(rest[0] ?? ''));
      }
      if (cmd.endsWith('-dhcpserverv4scope') || cmd.endsWith('-dhcpserverv4optionvalue')) {
        if (this.ctx.node !== 'DC01') return out(this.notHere(args[0]));
        return out(this.dhcp(cmd, rest));
      }
      if (/-ad|aegismfa|^get-winevent$/.test(cmd)) {
        if (!this.isDC()) return out(this.notHere(args[0]));
        if (!anyLogonServer(this.ctx.lab) && cmd !== 'get-winevent') return out('Unable to contact the server. This may be because this server does not exist, it is currently down, or it does not have the Active Directory Web Services running.');
        return out(this.ad(cmd, rest, line));
      }
      return out(`${args[0]} : The term '${args[0]}' is not recognized as the name of a cmdlet, function, script file, or operable program.\nType 'help' to see the commands available on ${this.ctx.node}.`);
    } catch (e) {
      return out(`Error: ${(e as Error).message}`);
    }
  }

  private notHere(cmd: string) {
    return `${cmd} : The term '${cmd}' is not available on ${this.ctx.node}. Run it on the server that owns the role.`;
  }

  // ---------- networking ----------
  private ipconfig(flag?: string): string {
    const { lab, node } = this.ctx;
    const st = lab.nodes[node];
    if (flag === '/renew') {
      if (!st.dhcp || st.staticIp) return 'The operation failed as no adapter is in the state permissible for this operation.\n(This adapter has a static address.)';
      const l = renewLease(lab, node);
      this.ctx.changed('ipconfig /renew');
      if (l.apipa) return 'An error occurred while renewing interface Ethernet : unable to contact your DHCP server. Request has timed out.';
      return `${this.ipconfig()}`;
    }
    if (flag === '/release') {
      if (st.lease) st.lease = { ...st.lease, ip: '0.0.0.0', gw: null, dns: [], apipa: true };
      this.ctx.changed('ipconfig /release');
      return 'Ethernet adapter Ethernet:\n\n   Connection-specific DNS Suffix  . :\n   IPv4 Address. . . . . . . . . . . : 0.0.0.0\n   Default Gateway . . . . . . . . . :';
    }
    if (flag === '/flushdns') return 'Windows IP Configuration\n\nSuccessfully flushed the DNS Resolver Cache.';
    const c = ipConfig(lab, node);
    const all = flag === '/all';
    const lines = ['Windows IP Configuration', ''];
    if (all) lines.push(`   Host Name . . . . . . . . . . . . : ${node}`, '   Primary Dns Suffix  . . . . . . . : corp.salonemutual.lab', '');
    lines.push('Ethernet adapter Ethernet:', '');
    lines.push(`   Connection-specific DNS Suffix  . : ${c.apipa ? '' : 'corp.salonemutual.lab'}`);
    if (all) {
      lines.push('   Description . . . . . . . . . . . : Red Hat VirtIO Ethernet Adapter');
      lines.push(`   DHCP Enabled. . . . . . . . . . . : ${c.dhcp ? 'Yes' : 'No'}`);
    }
    lines.push(`   ${c.apipa ? 'Autoconfiguration IPv4 Address' : 'IPv4 Address'}. . . . . . . . . . . : ${c.ip}${all && !c.apipa ? '(Preferred)' : ''}`);
    lines.push(`   Subnet Mask . . . . . . . . . . . : ${c.mask}`);
    lines.push(`   Default Gateway . . . . . . . . . : ${c.gw ?? ''}`);
    if (all) {
      if (c.dhcp && !c.apipa) lines.push(`   DHCP Server . . . . . . . . . . . : 10.10.10.10`);
      lines.push(`   DNS Servers . . . . . . . . . . . : ${c.dns[0] ?? ''}`);
      for (const d of c.dns.slice(1)) lines.push(`                                       ${d}`);
    }
    return lines.join('\n');
  }

  private tnc(rest: string[]): string {
    const host = positional(rest) ?? param(rest, 'ComputerName') ?? '';
    const port = Number(param(rest, 'Port') ?? 0);
    if (!port) return pingOutput(this.ctx, host, 'windows', 1).split('\n').slice(0, 2).join('\n');
    const r = tcpTest(this.ctx, host, port);
    const c = ipConfig(this.ctx.lab, this.ctx.node);
    if (!r.ip) return `WARNING: Name resolution of ${host} failed\n\nComputerName   : ${host}\nRemoteAddress  :\nTcpTestSucceeded : False`;
    return `${r.ok ? '' : `WARNING: TCP connect to (${r.ip} : ${port}) failed: ${r.detail}\n\n`}ComputerName     : ${host}\nRemoteAddress    : ${r.ip}\nRemotePort       : ${port}\nInterfaceAlias   : Ethernet\nSourceAddress    : ${c.ip}\nTcpTestSucceeded : ${r.ok ? 'True' : 'False'}`;
  }

  private routePrint(): string {
    const c = ipConfig(this.ctx.lab, this.ctx.node);
    return `===========================================================================\nIPv4 Route Table\n===========================================================================\nActive Routes:\nNetwork Destination        Netmask          Gateway       Interface  Metric\n          0.0.0.0          0.0.0.0   ${pad(c.gw ?? 'On-link', 14)}${pad(c.ip, 15)}  25\n        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331\n   ${pad(c.ip.replace(/\.\d+$/, '.0'), 16)}${pad(c.mask, 17)}On-link   ${pad(c.ip, 15)} 281\n===========================================================================`;
  }

  private getNetIp(): string {
    const c = ipConfig(this.ctx.lab, this.ctx.node);
    return `InterfaceAlias       : Ethernet\nInterfaceIndex       : 6\nIPv4Address          : ${c.ip}\nIPv4DefaultGateway   : ${c.gw ?? ''}\nDNSServer            : ${c.dns.join(', ')}\nNetProfile.Name      : ${c.apipa ? 'Unidentified network' : 'corp.salonemutual.lab'}`;
  }

  private netsh(rest: string[]): string {
    const { lab, node } = this.ctx;
    const st = lab.nodes[node];
    const line = rest.join(' ').toLowerCase();
    const sn = nodeByName(node)!;
    if (/interface (ipv4|ip) set address/.test(line)) {
      if (/source=dhcp|\bdhcp\b/.test(line)) {
        st.staticIp = undefined;
        if (!st.dhcp && sn.ip !== 'dhcp') return 'This host must keep a static address (server). Command not applied.';
        st.dhcp = true;
        renewLease(lab, node);
        this.ctx.changed('Set Ethernet to DHCP');
        return 'Ok.';
      }
      const nums = rest.filter((t) => /^\d+\.\d+\.\d+\.\d+$/.test(t));
      if (nums.length < 2) return 'The syntax supplied for this command is not valid. Check help for the correct syntax.\nUsage: netsh interface ipv4 set address name="Ethernet" static <ip> <mask> <gateway>';
      const [ip, mask, gw] = nums;
      const dns = st.staticIp?.dns ?? ipConfig(lab, node).dns;
      st.staticIp = { ip, mask, gw: gw ?? null, dns: dns.length ? dns : ['10.10.10.10'] };
      this.ctx.changed(`Static address ${ip} ${mask} gateway ${gw ?? 'none'}`);
      return 'Ok.';
    }
    if (/interface (ipv4|ip) set dns(servers)?/.test(line)) {
      if (/source=dhcp|\bdhcp\b/.test(line)) {
        if (st.staticIp) return 'Cannot use DHCP DNS on a statically addressed adapter.';
        this.ctx.changed('DNS from DHCP');
        return 'Ok.';
      }
      const ip = rest.find((t) => /^\d+\.\d+\.\d+\.\d+$/.test(t));
      if (!ip) return 'Usage: netsh interface ipv4 set dnsservers name="Ethernet" static <ip> primary';
      const cur = ipConfig(lab, node);
      st.staticIp = { ip: cur.ip, mask: cur.mask, gw: cur.gw, dns: [ip] };
      st.dhcp = st.dhcp && false;
      this.ctx.changed(`DNS server set to ${ip}`);
      return 'Ok.';
    }
    if (/interface show interface/.test(line)) {
      const p = st.switchPort ? lab.switchPorts[st.switchPort] : undefined;
      return `Admin State    State          Type             Interface Name\n-------------------------------------------------------------------------\nEnabled        ${p?.shutdown ? 'Disconnected ' : 'Connected    '}  Dedicated        Ethernet`;
    }
    return 'The following command was not found: netsh ' + rest.join(' ');
  }

  private getService(name?: string): string {
    const st = this.ctx.lab.nodes[this.ctx.node];
    const svcs = st.services ?? { Dnscache: 'Running', LanmanWorkstation: 'Running', W32Time: 'Running' };
    const list = Object.entries(svcs).filter(([n]) => !name || n.toLowerCase() === name.toLowerCase());
    if (name && !list.length) return `Get-Service : Cannot find any service with service name '${name}'.`;
    return ['Status   Name               DisplayName', '------   ----               -----------', ...list.map(([n, s]) => `${pad(s, 9)}${pad(n, 19)}${n}`)].join('\n');
  }

  private setService(cmd: string, name: string): string {
    const st = this.ctx.lab.nodes[this.ctx.node];
    const key = Object.keys(st.services ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
    if (!key || !st.services) return `${cmd} : Cannot find any service with service name '${name}'.`;
    if (cmd === 'stop-service') st.services[key] = 'Stopped';
    else st.services[key] = 'Running';
    this.ctx.changed(`${cmd} ${key}`);
    if (cmd === 'restart-service') return `WARNING: Waiting for service '${key}' to stop...\nWARNING: Waiting for service '${key}' to start...`;
    return '';
  }

  private whoamiGroups(sam: string): string {
    const u = this.ctx.lab.ad.users[sam];
    const groups = u?.groups ?? [];
    return ['GROUP INFORMATION', '-----------------', '', 'Group Name                          Type           Attributes', '=================================== ============== ==================================================', 'Everyone                            Well-known group Mandatory group, Enabled by default, Enabled group', ...groups.map((g) => `${pad(`CORP\\${g}`, 36)}Group          Mandatory group, Enabled by default, Enabled group`)].join('\n');
  }

  // ---------- BKP01 / FS01 ----------
  private sc(rest: string[]): string {
    if (this.ctx.node !== 'BKP01') return '[SC] OpenService FAILED 1060: The specified service does not exist as an installed service.';
    const { lab } = this.ctx;
    const st = lab.nodes.BKP01;
    if (rest[0]?.toLowerCase() === 'query') {
      return `SERVICE_NAME: BackupAgent\n        TYPE               : 10  WIN32_OWN_PROCESS\n        STATE              : 4  ${st.services!.BackupAgent === 'Running' ? 'RUNNING' : 'STOPPED'}\n        SERVICE_START_NAME : CORP\\svc-backup`;
    }
    if (rest[0]?.toLowerCase() === 'qc') return 'SERVICE_NAME: BackupAgent\n        START_TYPE         : 2   AUTO_START\n        BINARY_PATH_NAME   : "C:\\Program Files\\BackupAgent\\agent.exe"\n        SERVICE_START_NAME : CORP\\svc-backup';
    if (rest[0]?.toLowerCase() === 'config') {
      const i = rest.findIndex((t) => t.toLowerCase() === 'password=');
      if (i < 0 || !rest[i + 1]) return 'Usage: sc.exe config BackupAgent obj= CORP\\svc-backup password= <password>';
      st.serviceCredVersion = { BackupAgent: lab.ad.users['svc-backup'].passwordVersion };
      this.ctx.changed('BackupAgent credential updated to the current svc-backup password');
      return '[SC] ChangeServiceConfig SUCCESS';
    }
    return 'Usage: sc.exe query|qc|config BackupAgent ...';
  }

  private getContent(rest: string[]): string {
    const path = (positional(rest) ?? '').toLowerCase();
    if (this.ctx.node === 'BKP01' && path.includes('agent.log')) {
      const { lab } = this.ctx;
      const stale = (lab.nodes.BKP01.serviceCredVersion?.BackupAgent ?? 0) !== lab.ad.users['svc-backup'].passwordVersion;
      const now = new Date();
      const t = (m: number) => new Date(now.getTime() - m * 60000).toISOString().slice(11, 19);
      if (stale) return [5, 4, 3, 2, 1].map((m) => `${t(m)} ERROR  Kerberos pre-authentication failed for CORP\\svc-backup (0x18 KDC_ERR_PREAUTH_FAILED). Retrying job 'Nightly-FS01' in 60s`).join('\n');
      return `${t(3)} INFO   Authenticated as CORP\\svc-backup\n${t(2)} INFO   Job 'Nightly-FS01' running: 41% (182 GB)\n${t(1)} INFO   Job 'Nightly-FS01' running: 44% (196 GB)`;
    }
    return `Get-Content : Cannot find path '${positional(rest)}' because it does not exist.`;
  }

  private icacls(path: string): string {
    const share = path.split('\\').pop() || 'Finance';
    const grp = { Finance: 'GG-Finance', Operations: 'GG-Operations', HR: 'GG-HR' }[share] ?? 'GG-AllStaff';
    return `${path} CORP\\${grp}:(OI)(CI)(M)\n${' '.repeat(path.length)} CORP\\GG-Audit:(OI)(CI)(RX)\n${' '.repeat(path.length)} BUILTIN\\Administrators:(OI)(CI)(F)\n${' '.repeat(path.length)} NT AUTHORITY\\SYSTEM:(OI)(CI)(F)\n\nSuccessfully processed 1 files; Failed processing 0 files`;
  }

  // ---------- DHCP ----------
  private dhcp(cmd: string, rest: string[]): string {
    const { lab } = this.ctx;
    if (!isServiceUp(lab, 'DC01', 'DHCPServer')) return 'Failed to get information from DHCP server DC01. The DHCP server service is not running.';
    if (cmd === 'get-dhcpserverv4scope') {
      return ['ScopeId         SubnetMask      Name           State    StartRange      EndRange', '-------         ----------      ----           -----    ----------      --------', ...Object.values(lab.dhcp).map((s) => `${pad(s.scopeId, 16)}255.255.255.0   ${pad(`VLAN${s.vlan}`, 15)}Active   ${pad(s.start, 16)}${s.end}`)].join('\n');
    }
    const scopeId = param(rest, 'ScopeId') ?? '';
    const scope = lab.dhcp[scopeId];
    if (!scope) return `${cmd} : Failed to get the scope ${scopeId || '(none)'}. Use -ScopeId 10.10.20.0`;
    if (cmd === 'get-dhcpserverv4optionvalue') {
      return `OptionId   Name            Type       Value\n--------   ----            ----       -----\n51         Lease           DWord      {691200}\n15         DNS Domain Name String     {corp.salonemutual.lab}\n6          DNS Servers     IPv4Address {${scope.dns.join(', ')}}\n3          Router          IPv4Address {${scope.router}}`;
    }
    if (cmd === 'set-dhcpserverv4optionvalue') {
      const dns = param(rest, 'DnsServer');
      const router = param(rest, 'Router');
      if (!dns && !router) return 'Set-DhcpServerv4OptionValue : specify -DnsServer and/or -Router';
      if (dns) scope.dns = dns.split(',').map((s) => s.trim()).filter(Boolean);
      if (router) scope.router = router;
      this.ctx.changed(`Scope ${scopeId}: ${dns ? `DNS ${scope.dns.join(',')}` : ''}${router ? ` router ${router}` : ''}`);
      return '';
    }
    return `${cmd} is not supported in this lab.`;
  }

  // ---------- Active Directory ----------
  private findUser(id?: string): AdUser | undefined {
    if (!id) return undefined;
    const users = this.ctx.lab.ad.users;
    return users[id.toLowerCase()] ?? Object.values(users).find((u) => u.name.toLowerCase() === id.toLowerCase());
  }

  private fmtUser(u: AdUser, all: boolean): string {
    const ou = `${u.ou},DC=corp,DC=salonemutual,DC=lab`;
    const base = [`DistinguishedName : CN=${u.name},${ou}`, `Enabled           : ${u.enabled ? 'True' : 'False'}`, `Name              : ${u.name}`, `SamAccountName    : ${u.sam}`, `UserPrincipalName : ${u.sam}@corp.salonemutual.lab`];
    if (all) {
      base.push(`Title             : ${u.title ?? ''}`, `LockedOut         : ${u.locked ? 'True' : 'False'}`, `BadLogonCount     : ${u.badPwdCount}`, `PasswordLastSet   : ${new Date(Date.now() - (u.sam === 'jdavies' ? 1 : 40) * 86400000).toLocaleString()}`, `MemberOf          : {${u.groups.map((g) => `CN=${g},OU=Groups,DC=corp,DC=salonemutual,DC=lab`).join(', ')}}`);
    }
    return base.join('\n');
  }

  private ad(cmd: string, rest: string[], raw: string): string {
    const { lab } = this.ctx;
    const identity = param(rest, 'Identity') ?? positional(rest);
    switch (cmd) {
      case 'get-aduser': {
        if (param(rest, 'Filter') !== undefined) return Object.values(lab.ad.users).map((u) => this.fmtUser(u, false)).join('\n\n');
        const u = this.findUser(identity);
        if (!u) return `Get-ADUser : Cannot find an object with identity: '${identity}' under: 'DC=corp,DC=salonemutual,DC=lab'.`;
        return this.fmtUser(u, param(rest, 'Properties') !== undefined);
      }
      case 'new-aduser': {
        const name = param(rest, 'Name') ?? positional(rest);
        if (!name) return 'New-ADUser : Missing an argument for parameter -Name';
        const sam = (param(rest, 'SamAccountName') ?? name.replace(/\s+/g, '').toLowerCase()).toLowerCase();
        if (lab.ad.users[sam]) return `New-ADUser : The specified account already exists (${sam}).`;
        const path = param(rest, 'Path') ?? 'CN=Users';
        const ou = path.split(',').filter((p) => /^OU=/i.test(p)).join(',') || 'CN=Users';
        const enabled = (param(rest, 'Enabled') ?? '').toLowerCase().includes('true');
        lab.ad.users[sam] = { sam, name: param(rest, 'DisplayName') ?? name, ou, enabled, locked: false, groups: ['GG-AllStaff'], mfaRequired: false, badPwdCount: 0, passwordVersion: 1, title: param(rest, 'Title') };
        this.ctx.changed(`Created user ${sam} in ${ou}${enabled ? ' (enabled)' : ' (disabled)'}`);
        return enabled ? '' : `WARNING: ${sam} was created disabled. Set a password and run Enable-ADAccount -Identity ${sam}.`;
      }
      case 'enable-adaccount':
      case 'disable-adaccount':
      case 'unlock-adaccount': {
        const u = this.findUser(identity);
        if (!u) return `${cmd} : Cannot find an object with identity: '${identity}'.`;
        if (cmd === 'enable-adaccount') u.enabled = true;
        if (cmd === 'disable-adaccount') u.enabled = false;
        if (cmd === 'unlock-adaccount') {
          u.locked = false;
          u.badPwdCount = 0;
        }
        this.ctx.changed(`${cmd.replace('-adaccount', '')} ${u.sam}`);
        return '';
      }
      case 'set-adaccountpassword': {
        const u = this.findUser(identity);
        if (!u) return `Set-ADAccountPassword : Cannot find an object with identity: '${identity}'.`;
        u.passwordVersion += 1;
        u.badPwdCount = 0;
        this.ctx.changed(`Password reset for ${u.sam} (version ${u.passwordVersion})`);
        return u.service ? `Password reset. Remember: services still configured with the old password will fail to authenticate.` : 'Password reset.';
      }
      case 'add-adgroupmember':
      case 'remove-adgroupmember': {
        const g = param(rest, 'Identity') ?? positional(rest);
        const members = (param(rest, 'Members') ?? positional(rest, 1) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const grp = Object.keys(lab.ad.groups).find((k) => k.toLowerCase() === (g ?? '').toLowerCase());
        if (!grp) return `${cmd} : Cannot find an object with identity: '${g}'.`;
        for (const m of members) {
          const u = this.findUser(m);
          if (!u) return `${cmd} : Cannot find an object with identity: '${m}'.`;
          if (cmd === 'add-adgroupmember') {
            if (!u.groups.includes(grp)) u.groups.push(grp);
          } else u.groups = u.groups.filter((x) => x !== grp);
          for (const n of Object.values(lab.nodes)) if (n.loggedOnUser === u.sam) n.tokenStale = true;
          this.ctx.changed(`${cmd === 'add-adgroupmember' ? 'Added' : 'Removed'} ${u.sam} ${cmd === 'add-adgroupmember' ? 'to' : 'from'} ${grp}`);
        }
        return '';
      }
      case 'get-adgroupmember': {
        const g = param(rest, 'Identity') ?? positional(rest) ?? '';
        const grp = Object.keys(lab.ad.groups).find((k) => k.toLowerCase() === g.toLowerCase());
        if (!grp) return `Get-ADGroupMember : Cannot find an object with identity: '${g}'.`;
        const ms = Object.values(lab.ad.users).filter((u) => u.groups.includes(grp));
        return ['name                    SamAccountName', '----                    --------------', ...ms.map((u) => `${pad(u.name, 24)}${u.sam}`)].join('\n');
      }
      case 'get-adprincipalgroupmembership': {
        const u = this.findUser(identity);
        if (!u) return `Get-ADPrincipalGroupMembership : Cannot find an object with identity: '${identity}'.`;
        return ['name', '----', ...u.groups].join('\n');
      }
      case 'get-adgroup':
        return ['Name                  Description', '----                  -----------', ...Object.values(lab.ad.groups).map((g) => `${pad(g.name, 22)}${g.description}`)].join('\n');
      case 'search-adaccount': {
        if (!hasFlag(rest, 'LockedOut')) return 'Search-ADAccount : use -LockedOut';
        const ls = Object.values(lab.ad.users).filter((u) => u.locked);
        if (!ls.length) return '';
        return ['Name             SamAccountName  LockedOut', '----             --------------  ---------', ...ls.map((u) => `${pad(u.name, 17)}${pad(u.sam, 16)}True`)].join('\n');
      }
      case 'get-winevent': {
        const id = /id\s*=\s*(\d+)/i.exec(raw)?.[1];
        if (id === '4740') {
          if (!lab.events4740.length) return 'Get-WinEvent : No events were found that match the specified selection criteria.';
          return ['TimeCreated            Id   Message', '-----------            --   -------', ...lab.events4740.slice(-8).reverse().map((e) => `${pad(new Date(e.at).toLocaleTimeString(), 23)}4740 A user account was locked out. Account Name: ${e.user}  Caller Computer Name: ${e.caller}`)].join('\n');
        }
        if (id === '4771') {
          if (!lab.events4771.length) return 'Get-WinEvent : No events were found that match the specified selection criteria.';
          return ['TimeCreated            Id   Message', '-----------            --   -------', ...lab.events4771.slice(-10).reverse().map((e) => `${pad(new Date(e.at).toLocaleTimeString(), 23)}4771 Kerberos pre-authentication failed. Account: ${e.user}  Client Address: ::ffff:${e.ip}  Failure Code: 0x18`)].join('\n');
        }
        return "Usage: Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740}  (4740 lockouts, 4771 Kerberos failures)";
      }
      case 'get-aegismfa': {
        const u = this.findUser(identity);
        if (!u) return `Get-AegisMfa : user '${identity}' not found in Keycloak.`;
        return `User          : ${u.sam}\nRequired      : ${u.mfaRequired}\nRegistered    : ${u.mfaDevice ?? '(none)'}\nPolicy        : Reset requires identity verification through a trusted channel (MFA-RESET-01)`;
      }
      case 'enable-aegismfa': {
        const u = this.findUser(identity);
        if (!u) return `Enable-AegisMfa : user '${identity}' not found in Keycloak.`;
        u.mfaRequired = true;
        this.ctx.changed(`MFA required for ${u.sam} (enrollment at first sign-in)`);
        return `MFA is now required for ${u.sam}. They will enroll at first sign-in.`;
      }
      case 'reset-aegismfa': {
        const u = this.findUser(identity);
        if (!u) return `Reset-AegisMfa : user '${identity}' not found in Keycloak.`;
        const device = param(rest, 'Device') ?? 'new device';
        u.mfaDevice = `Authenticator (${device})`;
        lab.mfaResets.push({ user: u.sam, device, at: new Date().toISOString(), verifiedFirst: false });
        this.ctx.changed(`MFA for ${u.sam} reset to ${device}`);
        return `MFA for ${u.sam} reset. New device: ${device}.`;
      }
    }
    return `${cmd} is not supported in this lab.`;
  }
}

/** Read-only tools the AI client persona may run on its own PC (scenario client_facts). */
export function personaTool(ctx: ShellCtx, tool: string): string {
  const sh = new WindowsShell(ctx);
  switch (tool) {
    case 'read.ipconfig':
      return sh.exec('ipconfig').output;
    case 'read.ipconfig_all':
      return sh.exec('ipconfig /all').output;
    case 'read.whoami_groups': {
      const user = ctx.lab.nodes[ctx.node].loggedOnUser || ctx.operator;
      const u = ctx.lab.ad.users[user];
      return ['GROUP INFORMATION', ...(u?.groups ?? []).map((g) => `CORP\\${g}`)].join('\n');
    }
    default:
      return '(no output)';
  }
}

export { computeLease, hasAccess };
