// Running configuration generated from the model, in each platform's own syntax.
import { modelOf } from './catalog';
import { ciscoMac, prefixToMask } from './net';
import type { Device, Iface } from './types';

const wildcard = (prefix: number) => prefixToMask(prefix).split('.').map((o) => 255 - Number(o)).join('.');
const macDot = (m: string) => ciscoMac(m);

function iosIface(i: Iface, d: Device): string[] {
  const out = [`interface ${i.name}`];
  if (i.description) out.push(` description ${i.description}`);
  const sw = d.kind === 'switch' && !/^vlan/i.test(i.name) && i.type !== 'console' && !i.parent;
  if (sw && i.mode === 'routed') out.push(' no switchport');
  else if (sw) {
    if (i.dtp) out.push(` switchport mode dynamic ${i.dtp}`);
    else if ((i.mode ?? 'access') === 'trunk') {
      out.push(' switchport mode trunk');
      if (i.nativeVlan && i.nativeVlan !== 1) out.push(` switchport trunk native vlan ${i.nativeVlan}`);
      if (i.allowedVlans && i.allowedVlans !== 'all') out.push(` switchport trunk allowed vlan ${i.allowedVlans.join(',')}`);
      if (i.nonegotiate) out.push(' switchport nonegotiate');
    } else {
      out.push(' switchport mode access');
      if ((i.vlan ?? 1) !== 1) out.push(` switchport access vlan ${i.vlan}`);
    }
    const ps = i.portSecurity;
    if (ps?.enabled) {
      out.push(' switchport port-security');
      if (ps.max !== 1) out.push(` switchport port-security maximum ${ps.max}`);
      if (ps.violation !== 'shutdown') out.push(` switchport port-security violation ${ps.violation}`);
      if (ps.sticky) out.push(' switchport port-security mac-address sticky');
      for (const m of ps.macs) out.push(` switchport port-security mac-address ${ps.sticky ? 'sticky ' : ''}${macDot(m)}`);
    }
    if (i.channelGroup !== undefined) out.push(` channel-group ${i.channelGroup} mode ${i.channelMode ?? 'on'}`);
    if (i.portfast) out.push(' spanning-tree portfast');
    if (i.bpduGuard) out.push(' spanning-tree bpduguard enable');
    if (i.rootGuard) out.push(' spanning-tree guard root');
    if (i.dhcpTrust) out.push(' ip dhcp snooping trust', ...(d.dai?.vlans.length ? [' ip arp inspection trust'] : []));
  }
  if (i.parent && i.vlan) out.push(` encapsulation dot1Q ${i.vlan}`);
  if (i.dhcp && !i.ip) out.push(' ip address dhcp');
  else if (i.ip && i.prefix !== undefined) out.push(` ip address ${i.ip} ${prefixToMask(i.prefix)}`);
  else if (d.kind !== 'switch' && i.type !== 'console') out.push(' no ip address');
  if (i.helper) out.push(` ip helper-address ${i.helper}`);
  if (i.aclIn) out.push(` ip access-group ${i.aclIn} in`);
  if (i.aclOut) out.push(` ip access-group ${i.aclOut} out`);
  if (i.nat) out.push(` ip nat ${i.nat}`);
  if (i.ospf) {
    if (i.ospf.cost) out.push(` ip ospf cost ${i.ospf.cost}`);
    if (i.ospf.hello) out.push(` ip ospf hello-interval ${i.ospf.hello}`);
    if (i.ospf.dead) out.push(` ip ospf dead-interval ${i.ospf.dead}`);
  }
  if (i.mtu) out.push(` ip mtu ${i.mtu}`);
  if (i.hsrp) {
    const kw = i.hsrp.proto === 'vrrp' ? 'vrrp' : i.hsrp.proto === 'glbp' ? 'glbp' : 'standby';
    out.push(` ${kw} ${i.hsrp.group} ip ${i.hsrp.vip}`);
    if (i.hsrp.priority !== 100) out.push(` ${kw} ${i.hsrp.group} priority ${i.hsrp.priority}`);
    if (i.hsrp.preempt && kw !== 'vrrp') out.push(` ${kw} ${i.hsrp.group} preempt`);
  }
  if (i.speed !== 'auto') out.push(` speed ${i.speed}`);
  if (i.duplex !== 'auto' && i.type !== 'console' && i.type !== 'serial') out.push(` duplex ${i.duplex}`);
  if (i.type === 'serial') out.push(' clock rate 2000000');
  if (i.shutdown) out.push(' shutdown');
  else if (d.kind !== 'switch') out.push(' no shutdown');
  out.push('!');
  return out;
}

export function runningConfig(d: Device): string {
  const m = modelOf(d);
  if (d.kind === 'switch' || d.kind === 'router') {
    const sec = d.security;
    const lines = [`! ${m.vendor} ${m.name}, generated from the lab designer model`, `hostname ${d.name}`, '!', 'service password-encryption', ...(sec?.enableSecret ? ['enable secret 9 $9$********'] : []), 'no ip domain-lookup', 'ip domain-name corp.salonemutual.lab', '!'];
    if (d.kind === 'switch') {
      if (d.ipRouting) lines.push('ip routing', '!');
      if (d.vtp) lines.push(`vtp mode ${d.vtp.mode}`, ...(d.vtp.domain ? [`vtp domain ${d.vtp.domain}`] : []), ...(d.vtp.password ? ['vtp password ********'] : []), ...(d.vtp.version ? [`vtp version ${d.vtp.version}`] : []), '!');
      if (d.stp?.mode) lines.push(`spanning-tree mode ${d.stp.mode}`);
      if (d.stp?.bpduGuardDefault) lines.push('spanning-tree portfast bpduguard default');
      if (d.stp && d.stp.priority !== 32768) lines.push(`spanning-tree vlan 1-4094 priority ${d.stp.priority}`);
      if (d.stp?.enabled === false) lines.push('no spanning-tree vlan 1-4094');
      if (d.dhcpSnooping?.enabled) lines.push('ip dhcp snooping', ...(d.dhcpSnooping.vlans.length ? [`ip dhcp snooping vlan ${d.dhcpSnooping.vlans.join(',')}`] : []));
      if (d.dai?.vlans.length) lines.push(`ip arp inspection vlan ${d.dai.vlans.join(',')}`);
      lines.push('!');
    }
    for (const p of d.dhcpPools ?? []) {
      const [net, pre] = p.network.split('/');
      lines.push(`ip dhcp pool ${p.name}`, ...(net ? [` network ${net} ${prefixToMask(Number(pre))}`] : []), ...(p.gateway ? [` default-router ${p.gateway}`] : []), ...(p.dns?.length ? [` dns-server ${p.dns.join(' ')}`] : []), '!');
    }
    const vlans = Object.entries(d.vlans).filter(([id]) => id !== '1');
    if (d.vtp?.mode !== 'client') for (const [id, name] of vlans) lines.push(`vlan ${id}`, ` name ${name}`, '!');
    for (const i of d.interfaces) if (i.type !== 'console') lines.push(...iosIface(i, d));
    if (d.ospfProcess || d.interfaces.some((i) => i.ospf)) {
      lines.push('router ospf 1', ...(d.ospfProcess?.routerId ? [` router-id ${d.ospfProcess.routerId}`] : []));
      for (const i of d.interfaces.filter((x) => x.ospf && x.ip && x.prefix !== undefined)) lines.push(` network ${i.ip} 0.0.0.0 area ${i.ospf!.area}`);
      for (const i of d.interfaces.filter((x) => x.ospf?.passive)) lines.push(` passive-interface ${i.name}`);
      if (d.ospfProcess?.defaultOriginate) lines.push(' default-information originate');
      lines.push('!');
    }
    if (d.eigrpProcess || d.interfaces.some((i) => i.eigrp)) {
      lines.push(`router eigrp ${d.eigrpProcess?.as ?? d.interfaces.find((i) => i.eigrp)?.eigrp?.as}`, ...(d.eigrpProcess?.routerId ? [` eigrp router-id ${d.eigrpProcess.routerId}`] : []));
      for (const i of d.interfaces.filter((x) => x.eigrp && x.ip && x.prefix !== undefined)) lines.push(` network ${i.ip} 0.0.0.0`);
      for (const i of d.interfaces.filter((x) => x.eigrp?.passive)) lines.push(` passive-interface ${i.name}`);
      lines.push(' no auto-summary', '!');
    }
    if (d.natOverload) lines.push(`ip nat inside source list 1 interface ${d.natOverload.outside} overload`);
    for (const n of d.staticNat ?? []) lines.push(`ip nat inside source static ${n.inside} ${n.outside}`);
    for (const r of d.routes.filter((x) => x.kind !== 'connected')) {
      if (d.kind === 'switch' && !d.ipRouting && r.prefix === '0.0.0.0/0') lines.push(`ip default-gateway ${r.via}`);
      else {
        const [net, p] = r.prefix.split('/');
        lines.push(`ip route ${net} ${prefixToMask(Number(p))} ${r.via ?? r.iface ?? 'Null0'}${r.description ? ` name ${r.description.replace(/\s+/g, '_')}` : ''}`);
      }
    }
    for (const a of d.acls ?? []) {
      const numbered = /^\d+$/.test(a.name);
      if (!numbered) lines.push(`ip access-list ${a.type} ${a.name}`);
      for (const e of a.entries) {
        const body = e.remark ? `remark ${e.remark}` : a.type === 'standard' ? `${e.action} ${e.src}` : `${e.action} ${e.proto} ${e.src} ${e.dst}${e.port ? ` ${e.port.op} ${e.port.a}${e.port.b ? ` ${e.port.b}` : ''}` : ''}`;
        lines.push(numbered ? `access-list ${a.name} ${body}` : ` ${e.seq} ${body}`);
      }
    }
    if (d.firewall.length) {
      lines.push('!', 'ip access-list extended AEGIS-IN');
      for (const r of d.firewall) lines.push(` ${r.enabled ? '' : '! '}${r.action === 'pass' ? 'permit' : 'deny'} ${r.proto === 'any' ? 'ip' : r.proto} ${r.src} ${r.dst}${r.port !== 'any' ? ` eq ${r.port}` : ''}${r.log ? ' log' : ''}`);
    }
    for (const sp of d.span ?? []) lines.push(`monitor session ${sp.session} source interface ${sp.sources.join(' , ')} both`, ...(sp.dest ? [`monitor session ${sp.session} destination interface ${sp.dest}`] : []));
    if (sec?.banner) lines.push(`banner motd ^${sec.banner}^`);
    lines.push('!', 'line con 0', ' logging synchronous', 'line vty 0 15', ` transport input ${sec ? (sec.ssh && sec.telnet ? 'all' : sec.ssh ? 'ssh' : sec.telnet ? 'telnet' : 'none') : 'ssh'}`, ' login local', '!', 'end');
    void wildcard;
    return lines.join('\n');
  }
  if (d.kind === 'firewall') {
    const lines = [`# ${m.vendor} ${m.name} (${d.name}): interfaces, routes and rules as pf sees them`, '', '# Interfaces'];
    for (const i of d.interfaces.filter((x) => x.type !== 'console')) {
      lines.push(`#   ${i.name.padEnd(9)} ${(i.alias ?? '').padEnd(8)} ${i.ip ? `${i.ip}/${i.prefix}` : i.bridge ? `member of ${i.bridge}` : i.parent ? '' : 'unassigned'}${i.parent ? ` vlan ${i.vlan} on ${i.parent}` : ''}${i.shutdown ? ' (disabled)' : ''}`);
    }
    lines.push('', '# Gateways and static routes');
    for (const r of d.routes.filter((x) => x.kind !== 'connected')) lines.push(`route add -net ${r.prefix} ${r.via ?? ''}   # ${r.description ?? r.kind}`);
    lines.push('', '# Filter rules (first match wins, evaluated per interface)');
    for (const r of d.firewall) {
      const proto = r.proto === 'any' ? '' : r.proto === 'tcp/udp' ? ' proto { tcp udp }' : ` proto ${r.proto}`;
      const port = r.port !== 'any' ? ` port { ${r.port.replace(/,/g, ' ')} }` : '';
      lines.push(`${r.enabled ? '' : '# disabled: '}${r.action === 'pass' ? 'pass' : 'block'} in${r.log ? ' log' : ''} quick${r.iface !== 'any' ? ` on ${r.iface}` : ''}${proto} from ${r.src} to ${r.dst}${port}   # ${r.id} ${r.descr}`);
    }
    return lines.join('\n');
  }
  if (d.os === 'windows' || d.kind === 'pc' || d.kind === 'laptop') {
    const lines = ['Windows IP Configuration', '', `   Host Name . . . . . . . . . . . . : ${d.name}`, ''];
    for (const i of d.interfaces.filter((x) => x.type === 'copper' || x.type === 'wireless' || x.type === 'virtual')) {
      lines.push(`Ethernet adapter ${i.name}:`, '');
      lines.push(`   Physical Address. . . . . . . . . : ${i.mac ? i.mac.replace(/:/g, '-').toUpperCase() : 'not reported'}`);
      lines.push(`   DHCP Enabled. . . . . . . . . . . : ${i.dhcp ? 'Yes' : 'No'}`);
      if (i.ip) {
        lines.push(`   IPv4 Address. . . . . . . . . . . : ${i.ip}${i.ip.startsWith('169.254') ? '(Autoconfiguration)' : '(Preferred)'}`);
        lines.push(`   Subnet Mask . . . . . . . . . . . : ${prefixToMask(i.prefix ?? 24)}`);
        lines.push(`   Default Gateway . . . . . . . . . : ${i.gateway ?? ''}`);
      } else lines.push('   Media State . . . . . . . . . . . : Media disconnected');
      lines.push('');
    }
    return lines.join('\n');
  }
  // Linux / cloud: netplan
  const lines = ['# /etc/netplan/50-aegis.yaml (generated)', 'network:', '  version: 2', '  ethernets:'];
  for (const i of d.interfaces.filter((x) => x.type !== 'console' && x.type !== 'terminal')) {
    lines.push(`    ${i.name}:`);
    if (i.mac) lines.push(`      match: { macaddress: "${i.mac}" }  # ${ciscoMac(i.mac)}`);
    if (i.dhcp) lines.push('      dhcp4: true');
    else if (i.ip) lines.push(`      addresses: [${i.ip}/${i.prefix}]`);
    if (i.gateway) lines.push('      routes:', `        - to: default`, `          via: ${i.gateway}`);
    if (i.shutdown) lines.push('      # link administratively down');
  }
  for (const r of d.routes.filter((x) => x.kind !== 'connected')) lines.push(`  # route ${r.prefix} via ${r.via ?? r.iface} (${r.description ?? r.kind})`);
  return lines.join('\n');
}
