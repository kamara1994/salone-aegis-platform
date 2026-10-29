// Running configuration generated from the model, in each platform's own syntax.
import { modelOf } from './catalog';
import { ciscoMac, prefixToMask } from './net';
import type { Device, Iface } from './types';

function iosIface(i: Iface, d: Device): string[] {
  const out = [`interface ${i.name}`];
  if (i.description) out.push(` description ${i.description}`);
  if (d.kind === 'switch' && !/^vlan/i.test(i.name) && i.type !== 'console') {
    if ((i.mode ?? 'access') === 'trunk') {
      out.push(' switchport mode trunk');
      if (i.nativeVlan && i.nativeVlan !== 1) out.push(` switchport trunk native vlan ${i.nativeVlan}`);
      if (i.allowedVlans && i.allowedVlans !== 'all') out.push(` switchport trunk allowed vlan ${i.allowedVlans.join(',')}`);
    } else {
      out.push(' switchport mode access');
      if ((i.vlan ?? 1) !== 1) out.push(` switchport access vlan ${i.vlan}`);
      out.push(' spanning-tree portfast');
    }
  }
  if (i.parent && i.vlan) out.push(` encapsulation dot1Q ${i.vlan}`);
  if (i.ip && i.prefix !== undefined) out.push(` ip address ${i.ip} ${prefixToMask(i.prefix)}`);
  else if (d.kind !== 'switch' && i.type !== 'console') out.push(' no ip address');
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
    const lines = [
      `! ${m.vendor} ${m.name}, generated from the lab designer model`,
      `hostname ${d.name}`,
      '!',
      'service password-encryption',
      'no ip domain-lookup',
      'ip domain-name corp.salonemutual.lab',
      '!',
    ];
    const vlans = Object.entries(d.vlans).filter(([id]) => id !== '1');
    for (const [id, name] of vlans) lines.push(`vlan ${id}`, ` name ${name}`, '!');
    for (const i of d.interfaces) if (i.type !== 'console') lines.push(...iosIface(i, d));
    for (const r of d.routes.filter((x) => x.kind !== 'connected')) {
      if (d.kind === 'switch' && r.prefix === '0.0.0.0/0') lines.push(`ip default-gateway ${r.via}`);
      else {
        const [net, p] = r.prefix.split('/');
        lines.push(`ip route ${net} ${prefixToMask(Number(p))} ${r.via ?? r.iface ?? 'Null0'}${r.description ? ` name ${r.description.replace(/\s+/g, '_')}` : ''}`);
      }
    }
    if (d.firewall.length) {
      lines.push('!', 'ip access-list extended AEGIS-IN');
      for (const r of d.firewall) lines.push(` ${r.enabled ? '' : '! '}${r.action === 'pass' ? 'permit' : 'deny'} ${r.proto === 'any' ? 'ip' : r.proto} ${r.src} ${r.dst}${r.port !== 'any' ? ` eq ${r.port}` : ''}${r.log ? ' log' : ''}`);
    }
    lines.push('!', 'line con 0', ' logging synchronous', 'line vty 0 15', ' transport input ssh', ' login local', '!', 'end');
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
