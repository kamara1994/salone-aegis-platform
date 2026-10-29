// Design audit: everything a senior network engineer would flag in a review, in one list.
// Combines control-plane problems (STP, EtherChannel, OSPF, HSRP, DHCP, PoE) with link checks,
// addressing mistakes, firewall rule hygiene and management-plane hardening. Every finding says
// where it is and how to fix it.
import { MODEL_BY_KEY, modelOf } from './catalog';
import { inCidr, ipToInt, maskOf, parseCidr } from './net';
import { controlPlane } from './protocols';
import { l3Ifaces, ownerOfIp } from './simulate';
import type { Device, FirewallRule, LabDoc } from './types';
import { cableOnPort, cableStatus, deviceById } from './validate';

export type AuditArea = 'switching' | 'routing' | 'addressing' | 'security' | 'resilience' | 'physical' | 'services';
export interface Finding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  area: AuditArea;
  title: string;
  detail: string;
  fix?: string;
  devices: string[];
  cables?: string[];
}

const ANY = (s: string) => s === 'any' || s === '0.0.0.0/0';

/** Rule `a` covers everything rule `b` matches (so `b`, later in the list, never fires). */
function covers(a: FirewallRule, b: FirewallRule): boolean {
  const net = (x: string, y: string) => {
    if (ANY(x)) return true;
    if (ANY(y)) return false;
    const px = parseCidr(x.includes('/') ? x : `${x}/32`);
    const py = parseCidr(y.includes('/') ? y : `${y}/32`);
    return !!px && !!py && px.prefix <= py.prefix && (py.net & maskOf(px.prefix)) >>> 0 === px.net;
  };
  return (a.iface === 'any' || a.iface === b.iface) && net(a.src, b.src) && net(a.dst, b.dst) && (a.proto === 'any' || a.proto === b.proto) && (a.port === 'any' || String(a.port) === String(b.port));
}

export function auditDoc(doc: LabDoc): Finding[] {
  const out: Finding[] = [];
  const add = (f: Omit<Finding, 'id'>) => out.push({ ...f, id: `${f.area}:${out.length}` });
  const cp = controlPlane(doc);
  const name = (id: string) => deviceById(doc, id)?.name ?? id;

  // ---- control plane ----
  for (const i of cp.issues)
    add({ severity: i.severity, area: i.topic === 'stp' || i.topic === 'etherchannel' ? 'switching' : i.topic === 'ospf' || i.topic === 'hsrp' ? 'routing' : i.topic === 'poe' ? 'physical' : 'services', title: i.message.split(/[.:]/)[0], detail: i.message, fix: i.fix, devices: i.devices });

  // ---- links ----
  for (const c of doc.cables) {
    const s = cableStatus(doc, c);
    for (const iss of s.issues.filter((x) => x.severity === 'down' || x.severity === 'degraded'))
      add({ severity: iss.severity === 'down' ? 'critical' : 'warning', area: 'physical', title: `${name(c.a.device)} ${c.a.port} ↔ ${name(c.b.device)} ${c.b.port}: ${iss.code.replace(/_/g, ' ')}`, detail: iss.message, fix: iss.fix, devices: [c.a.device, c.b.device], cables: [c.id] });
  }

  // ---- addressing ----
  const seen = new Map<string, string[]>();
  for (const d of doc.devices) for (const i of l3Ifaces(d)) {
    if (i.hsrp?.vip === i.ip) continue;
    const k = i.ip!;
    seen.set(k, [...(seen.get(k) ?? []), `${d.id}|${d.name} ${i.name}`]);
  }
  for (const [ip, owners] of seen) if (owners.length > 1) add({ severity: 'critical', area: 'addressing', title: `Duplicate address ${ip}`, detail: `${owners.map((o) => o.split('|')[1]).join(' and ')} both use ${ip}. ARP answers will flap between them.`, fix: 'Give one of them a different address, or use DHCP.', devices: owners.map((o) => o.split('|')[0]) });
  for (const d of doc.devices) {
    if (modelOf(d).forwarding !== 'host') continue;
    for (const i of l3Ifaces(d)) {
      if (!i.gateway) {
        if (d.kind !== 'cloud') add({ severity: 'warning', area: 'addressing', title: `${d.name} has no default gateway`, detail: `${d.name} ${i.name} (${i.ip}/${i.prefix}) can only reach its own subnet.`, fix: 'Set the gateway to the VLAN router address.', devices: [d.id] });
        continue;
      }
      const sameNet = i.prefix !== undefined && ((ipToInt(i.gateway)! & maskOf(i.prefix)) >>> 0) === ((ipToInt(i.ip!)! & maskOf(i.prefix)) >>> 0);
      if (!sameNet) add({ severity: 'critical', area: 'addressing', title: `${d.name} gateway is off-subnet`, detail: `Gateway ${i.gateway} is not inside ${i.ip}/${i.prefix}, so ARP for it never succeeds.`, fix: 'Use a gateway address inside the host subnet.', devices: [d.id] });
      else if (!ownerOfIp(doc, i.gateway) && !doc.devices.some((x) => x.interfaces.some((y) => y.hsrp?.vip === i.gateway))) add({ severity: 'critical', area: 'addressing', title: `${d.name} gateway ${i.gateway} does not exist`, detail: `Nothing in the lab owns ${i.gateway}.`, fix: 'Point the host at the real router interface or HSRP virtual IP.', devices: [d.id] });
      if (/^169\.254\./.test(i.ip!)) add({ severity: 'critical', area: 'services', title: `${d.name} has an APIPA address`, detail: `${i.ip} means DHCP failed.`, fix: 'Run ipconfig /renew from the Design CLI to see why.', devices: [d.id] });
    }
  }

  // ---- security ----
  for (const d of doc.devices) {
    const network = d.kind === 'router' || d.kind === 'switch' || d.kind === 'firewall';
    if (network && d.origin === 'design') {
      const s = d.security ?? { ssh: false, telnet: true, enableSecret: false };
      if (s.telnet) add({ severity: 'warning', area: 'security', title: `${d.name} allows Telnet`, detail: 'Telnet sends passwords in clear text.', fix: 'line vty 0 15 → transport input ssh (after crypto key generate rsa).', devices: [d.id] });
      if (!s.ssh) add({ severity: 'info', area: 'security', title: `${d.name} has no SSH`, detail: 'No RSA keys / SSH server configured for management.', fix: 'ip domain-name lab.local, crypto key generate rsa modulus 2048, ip ssh version 2.', devices: [d.id] });
      if (!s.enableSecret) add({ severity: 'warning', area: 'security', title: `${d.name} has no enable secret`, detail: 'Anyone at the console can enter privileged mode.', fix: 'enable secret <strong password>.', devices: [d.id] });
      if (!s.banner) add({ severity: 'info', area: 'security', title: `${d.name} has no login banner`, detail: 'A legal warning banner is expected on managed devices.', fix: 'banner motd #Authorised access only#', devices: [d.id] });
    }
    if (d.kind === 'switch') {
      const access = d.interfaces.filter((i) => i.mode !== 'trunk' && !i.parent && i.type !== 'console' && !/^vlan/i.test(i.name));
      const unused = access.filter((i) => !cableOnPort(doc, d.id, i.name) && !i.shutdown);
      if (unused.length > 4) add({ severity: 'info', area: 'security', title: `${d.name}: ${unused.length} unused ports are enabled`, detail: `Unused ports such as ${unused.slice(0, 3).map((i) => i.name).join(', ')} are up and in VLAN ${unused[0].vlan ?? 1}; anyone can plug in.`, fix: 'interface range … → shutdown, and put them in an unused "parking" VLAN.', devices: [d.id] });
      const inV1 = access.filter((i) => cableOnPort(doc, d.id, i.name) && (i.vlan ?? 1) === 1);
      if (inV1.length) add({ severity: 'warning', area: 'switching', title: `${d.name}: users in VLAN 1`, detail: `${inV1.map((i) => i.name).join(', ')} carry traffic in the default VLAN.`, fix: 'Move access ports to a named VLAN.', devices: [d.id] });
      const trunks = d.interfaces.filter((i) => i.mode === 'trunk' && cableOnPort(doc, d.id, i.name));
      const nat1 = trunks.filter((i) => (i.nativeVlan ?? 1) === 1);
      if (nat1.length) add({ severity: 'info', area: 'security', title: `${d.name}: native VLAN 1 on trunks`, detail: `${nat1.map((i) => i.name).join(', ')} leave the native VLAN at 1 (VLAN hopping risk).`, fix: 'switchport trunk native vlan 999 on both ends.', devices: [d.id] });
      const allAllowed = trunks.filter((i) => i.allowedVlans === undefined || i.allowedVlans === 'all');
      if (allAllowed.length) add({ severity: 'info', area: 'switching', title: `${d.name}: trunks allow every VLAN`, detail: `${allAllowed.map((i) => i.name).join(', ')} carry all VLANs.`, fix: 'switchport trunk allowed vlan <only the VLANs needed>.', devices: [d.id] });
      const edge = access.filter((i) => cableOnPort(doc, d.id, i.name) && !i.portfast && (() => {
        const c = cableOnPort(doc, d.id, i.name)!;
        const peer = deviceById(doc, c.a.device === d.id ? c.b.device : c.a.device);
        return peer && modelOf(peer).forwarding === 'host';
      })());
      if (edge.length && d.origin === 'design') add({ severity: 'info', area: 'switching', title: `${d.name}: host ports without PortFast`, detail: `${edge.map((i) => i.name).join(', ')} wait 30 s in listening/learning after link up, so DHCP can time out.`, fix: 'spanning-tree portfast on host-facing ports.', devices: [d.id] });
    }
    if (d.kind === 'switch') {
      const hostPorts = d.interfaces.filter((i) => (i.mode ?? 'access') === 'access' && !i.parent && i.type !== 'console' && !/^vlan/i.test(i.name) && (() => {
        const c = cableOnPort(doc, d.id, i.name);
        const peer = c ? deviceById(doc, c.a.device === d.id ? c.b.device : c.a.device) : undefined;
        return !!peer && modelOf(peer).forwarding === 'host';
      })());
      const noPs = hostPorts.filter((i) => !i.portSecurity?.enabled);
      if (d.origin === 'design' && noPs.length) add({ severity: 'info', area: 'security', title: `${d.name}: host ports without port security`, detail: `${noPs.map((i) => i.name).slice(0, 6).join(', ')}${noPs.length > 6 ? '…' : ''} accept any MAC address.`, fix: 'switchport port-security (maximum 1-2, sticky, violation restrict or shutdown).', devices: [d.id] });
      const pfNoGuard = d.interfaces.filter((i) => i.portfast && !i.bpduGuard && !d.stp?.bpduGuardDefault);
      if (d.origin === 'design' && pfNoGuard.length) add({ severity: 'info', area: 'switching', title: `${d.name}: PortFast without BPDU guard`, detail: `${pfNoGuard.map((i) => i.name).join(', ')} would forward immediately if someone plugs a switch in, creating a loop.`, fix: 'spanning-tree portfast bpduguard default (or spanning-tree bpduguard enable per port).', devices: [d.id] });
      const dyn = d.interfaces.filter((i) => i.dtp && cableOnPort(doc, d.id, i.name));
      if (dyn.length) add({ severity: 'info', area: 'security', title: `${d.name}: DTP negotiation on ${dyn.map((i) => i.name).join(', ')}`, detail: 'Dynamic ports let an attacker negotiate a trunk (switch spoofing) and reach every VLAN.', fix: 'switchport mode access or switchport mode trunk with switchport nonegotiate.', devices: [d.id] });
      const sn = d.dhcpSnooping;
      if (sn?.enabled && sn.vlans.length && !d.interfaces.some((i) => i.dhcpTrust)) add({ severity: 'warning', area: 'services', title: `${d.name}: DHCP snooping with no trusted port`, detail: 'Every DHCP offer, including the real server’s, is dropped on untrusted ports. Clients will fall back to 169.254 addresses.', fix: 'ip dhcp snooping trust on the uplink toward the DHCP server or relay.', devices: [d.id] });
      if (sn?.enabled && !sn.vlans.length) add({ severity: 'info', area: 'services', title: `${d.name}: DHCP snooping enabled on no VLAN`, detail: 'ip dhcp snooping is on globally, but no VLAN is listed, so nothing is inspected.', fix: 'ip dhcp snooping vlan <list>.', devices: [d.id] });
      if (d.dai?.vlans.length && !sn?.enabled) add({ severity: 'warning', area: 'security', title: `${d.name}: DAI without DHCP snooping`, detail: 'Dynamic ARP inspection validates ARP against the snooping binding table; without snooping there are no bindings.', fix: 'Enable ip dhcp snooping on the same VLANs.', devices: [d.id] });
      if (d.vtp?.mode === 'server' && d.vtp.domain && doc.devices.filter((x) => x.vtp?.domain === d.vtp!.domain && x.vtp?.mode === 'server').length > 1 && doc.devices.find((x) => x.vtp?.domain === d.vtp!.domain && x.vtp?.mode === 'server')?.id === d.id) add({ severity: 'info', area: 'switching', title: `VTP domain ${d.vtp.domain} has several servers`, detail: 'Any server with a higher revision overwrites every VLAN database in the domain (the "VTP bomb").', fix: 'Keep one server, make access switches clients or transparent, set a VTP password, or use VTPv3.', devices: doc.devices.filter((x) => x.vtp?.domain === d.vtp!.domain && x.vtp?.mode === 'server').map((x) => x.id) });
    }
    for (const i of d.interfaces) for (const name of [i.aclIn, i.aclOut].filter((x): x is string => !!x)) if (!d.acls?.some((a) => a.name === name) && !d.firewall.length) add({ severity: 'warning', area: 'security', title: `${d.name} ${i.name}: ACL ${name} is not defined`, detail: `ip access-group ${name} is applied, but the ACL does not exist, so IOS permits everything.`, fix: `Create ip access-list … ${name}, or remove the access-group.`, devices: [d.id] });
    if (d.firewall.length) {
      const rules = d.firewall.filter((r) => r.enabled);
      rules.forEach((r, k) => {
        if (r.action === 'pass' && ANY(r.src) && ANY(r.dst) && r.port === 'any' && r.proto === 'any') add({ severity: 'warning', area: 'security', title: `${d.name} rule ${r.id} passes any to any`, detail: `"${r.descr}" on ${r.iface} allows every protocol to every destination.`, fix: 'Replace with rules for the services the segment needs.', devices: [d.id] });
        const shadow = rules.slice(0, k).find((p) => covers(p, r));
        if (shadow && r.id !== 99) add({ severity: 'warning', area: 'security', title: `${d.name} rule ${r.id} is shadowed`, detail: `Rule ${shadow.id} "${shadow.descr}" matches everything rule ${r.id} "${r.descr}" does and comes first, so rule ${r.id} never fires.`, fix: `Move rule ${r.id} above rule ${shadow.id}, or delete it.`, devices: [d.id] });
      });
      if (!rules.some((r) => r.action === 'block' && ANY(r.src) && ANY(r.dst))) add({ severity: 'info', area: 'security', title: `${d.name} has no explicit logged deny`, detail: 'Traffic falls to the implicit deny without a log line.', fix: 'Add a final block any any rule with logging on.', devices: [d.id] });
    }
  }

  // ---- resilience: single points of failure (articulation devices on the network graph) ----
  const net = doc.devices.filter((d) => ['router', 'switch', 'firewall'].includes(d.kind));
  const adj = new Map<string, Set<string>>();
  for (const c of doc.cables) {
    if (c.disabled) continue;
    for (const [x, y] of [[c.a.device, c.b.device], [c.b.device, c.a.device]]) {
      if (!adj.has(x)) adj.set(x, new Set());
      adj.get(x)!.add(y);
    }
  }
  const comp = (skip: string) => {
    const nodes = [...adj.keys()].filter((k) => k !== skip);
    const seenC = new Set<string>();
    let n = 0;
    for (const s of nodes) {
      if (seenC.has(s)) continue;
      n++;
      const q = [s];
      seenC.add(s);
      while (q.length) for (const y of adj.get(q.pop()!) ?? []) if (y !== skip && !seenC.has(y)) (seenC.add(y), q.push(y));
    }
    return n;
  };
  const base = comp('');
  for (const d of net) {
    if (!adj.has(d.id)) continue;
    const hosts = [...(adj.get(d.id) ?? [])].map((id) => deviceById(doc, id)).filter((x): x is Device => !!x);
    if (hosts.length < 2) continue;
    if (comp(d.id) > base) add({ severity: 'info', area: 'resilience', title: `${d.name} is a single point of failure`, detail: `If ${d.name} fails, the network splits. Neighbours: ${hosts.slice(0, 5).map((h) => h.name).join(', ')}${hosts.length > 5 ? '…' : ''}.`, fix: 'Add a redundant path (second uplink, EtherChannel, or HSRP pair).', devices: [d.id] });
  }

  // ---- services: DHCP pools that do not match any interface ----
  for (const d of doc.devices) for (const p of d.dhcpPools ?? []) {
    if (!p.network) add({ severity: 'warning', area: 'services', title: `DHCP pool ${p.name} on ${d.name} has no network`, detail: 'The pool hands out nothing.', fix: 'network <subnet> <mask> in dhcp-config mode.', devices: [d.id] });
    else if (p.gateway && !inCidr(p.gateway, p.network)) add({ severity: 'critical', area: 'services', title: `DHCP pool ${p.name} default-router is outside the pool`, detail: `${p.gateway} is not in ${p.network}; clients will get an unusable gateway.`, fix: 'default-router <address inside the subnet>.', devices: [d.id] });
  }

  // ---- PoE budget usage ----
  for (const d of doc.devices) {
    const m = MODEL_BY_KEY[d.model];
    if (!m?.poeBudgetW) continue;
    const drawn = doc.devices.filter((x) => MODEL_BY_KEY[x.model]?.poweredBy === 'poe' && x.power === 'running' && x.interfaces.some((i) => {
      const c = cableOnPort(doc, x.id, i.name);
      return c && (c.a.device === d.id || c.b.device === d.id);
    })).reduce((s, x) => s + (MODEL_BY_KEY[x.model].poeDrawW ?? 0), 0);
    if (drawn > m.poeBudgetW * 0.8) add({ severity: 'warning', area: 'physical', title: `${d.name} PoE budget ${Math.round((drawn / m.poeBudgetW) * 100)}% used`, detail: `${drawn.toFixed(1)} W of ${m.poeBudgetW} W allocated.`, fix: 'Move powered devices to another PoE switch or add a power supply.', devices: [d.id] });
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function auditScore(f: Finding[]): number {
  const penalty = f.reduce((s, x) => s + (x.severity === 'critical' ? 12 : x.severity === 'warning' ? 4 : 1), 0);
  return Math.max(0, 100 - penalty);
}
