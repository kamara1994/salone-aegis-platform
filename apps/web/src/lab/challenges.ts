// Troubleshooting practice (Packet Tracer activities / CCNA troubleshooting labs): inject one
// realistic hidden fault into the design, let the operator find it with the CLI, simulation and
// capture, then reveal what was changed. Also: connectivity goals with pass/fail checking, and
// exports (lab JSON, inventory CSV, bill of materials).
import { modelOf, MODEL_BY_KEY } from './catalog';
import { ping, primaryIp, simulatePacket } from './simulate';
import type { Device, Goal, LabDoc } from './types';
import { cableOnPort, deviceById } from './validate';

export interface ChallengeDef {
  id: string;
  title: string;
  level: 'CCNA' | 'CCNP' | 'Ops';
  /** What the user reports, as a ticket would say it. */
  symptom: (doc: LabDoc, ctx: Ctx) => string;
  /** Applies the fault; returns a description of the change, or null if the lab has nothing to break this way. */
  apply: (doc: LabDoc, ctx: Ctx) => string | null;
}
interface Ctx {
  host: Device;
  sw?: Device;
  port?: string;
}

const hostsOnSwitch = (doc: LabDoc) =>
  doc.devices
    .filter((d) => modelOf(d).forwarding === 'host' && d.power !== 'stopped' && d.interfaces.some((i) => i.ip && !i.ip.startsWith('169.254')))
    .flatMap((h) => {
      const nic = h.interfaces.find((i) => i.ip && (i.type === 'copper' || i.type === 'virtual'));
      const c = nic ? cableOnPort(doc, h.id, nic.name) : undefined;
      if (!c) return [];
      const far = c.a.device === h.id ? c.b : c.a;
      const sw = deviceById(doc, far.device);
      return [{ host: h, sw: sw?.kind === 'switch' ? sw : undefined, port: sw?.kind === 'switch' ? far.port : undefined }];
    });

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'wrong-vlan',
    title: 'Workstation lost the network after a desk move',
    level: 'CCNA',
    symptom: (_d, c) => `${c.host.name} cannot reach anything since facilities re-patched the desk. Link light is on.`,
    apply: (doc, c) => {
      if (!c.sw || !c.port) return null;
      const p = deviceById(doc, c.sw.id)!.interfaces.find((i) => i.name === c.port)!;
      if (p.mode === 'trunk') return null;
      const before = p.vlan ?? 1;
      const vlans = Object.keys(c.sw.vlans).map(Number).filter((v) => v !== before);
      p.vlan = vlans.find((v) => v !== 1) ?? 999;
      return `${c.sw.name} ${c.port} was moved from access VLAN ${before} to VLAN ${p.vlan}. Fix: switchport access vlan ${before}.`;
    },
  },
  {
    id: 'gateway-typo',
    title: 'Can reach local printers but not the internet',
    level: 'CCNA',
    symptom: (_d, c) => `${c.host.name} can talk to devices in its own subnet but nothing beyond it.`,
    apply: (doc, c) => {
      const h = deviceById(doc, c.host.id)!;
      const nic = h.interfaces.find((i) => i.gateway);
      if (!nic) return null;
      const before = nic.gateway!;
      const parts = before.split('.');
      parts[3] = String((Number(parts[3]) + 253) % 254 || 254);
      nic.gateway = parts.join('.');
      nic.dhcp = false;
      return `${h.name} ${nic.name} default gateway was changed from ${before} to ${nic.gateway}. Fix: set it back to ${before}.`;
    },
  },
  {
    id: 'mask',
    title: 'Some servers unreachable, others fine',
    level: 'CCNA',
    symptom: (_d, c) => `${c.host.name} reaches a few addresses but most remote services time out.`,
    apply: (doc, c) => {
      const h = deviceById(doc, c.host.id)!;
      const nic = h.interfaces.find((i) => i.ip && i.prefix);
      if (!nic || nic.prefix! < 16) return null;
      const before = nic.prefix!;
      nic.prefix = before + 4 > 30 ? before - 8 : before + 4;
      nic.dhcp = false;
      return `${h.name} ${nic.name} prefix length changed from /${before} to /${nic.prefix}. Fix: restore /${before}.`;
    },
  },
  {
    id: 'trunk-prune',
    title: 'Whole department offline',
    level: 'CCNA',
    symptom: (_d, c) => `Every user in ${c.host.name}'s VLAN lost access at the same moment. Other VLANs are fine.`,
    apply: (doc, c) => {
      if (!c.sw) return null;
      const sw = deviceById(doc, c.sw.id)!;
      const vlan = sw.interfaces.find((i) => i.name === c.port)?.vlan;
      const trunk = sw.interfaces.find((i) => i.mode === 'trunk' && cableOnPort(doc, sw.id, i.name));
      if (!trunk || !vlan) return null;
      const all = Object.keys(sw.vlans).map(Number);
      trunk.allowedVlans = (trunk.allowedVlans === 'all' || !trunk.allowedVlans ? all : trunk.allowedVlans).filter((v) => v !== vlan);
      return `VLAN ${vlan} was removed from the allowed list on ${sw.name} trunk ${trunk.name}. Fix: switchport trunk allowed vlan add ${vlan}.`;
    },
  },
  {
    id: 'duplex',
    title: 'Network is slow and file copies fail',
    level: 'Ops',
    symptom: (_d, c) => `${c.host.name} is "really slow"; large transfers stall. Small pings mostly work.`,
    apply: (doc, c) => {
      if (!c.sw || !c.port) return null;
      const p = deviceById(doc, c.sw.id)!.interfaces.find((i) => i.name === c.port)!;
      p.speed = 100;
      p.duplex = 'half';
      return `${c.sw.name} ${c.port} was hard-set to 100 Mb/s half duplex while the host auto-negotiates (duplex mismatch, late collisions). Fix: speed auto / duplex auto.`;
    },
  },
  {
    id: 'shut-uplink',
    title: 'Switch stack unreachable',
    level: 'CCNA',
    symptom: () => 'Monitoring lost every device behind one access switch.',
    apply: (doc, c) => {
      if (!c.sw) return null;
      const sw = deviceById(doc, c.sw.id)!;
      const up = sw.interfaces.find((i) => i.mode === 'trunk' && cableOnPort(doc, sw.id, i.name) && !i.shutdown);
      if (!up) return null;
      up.shutdown = true;
      return `${sw.name} ${up.name} (the uplink) was administratively shut down. Fix: interface ${up.name} → no shutdown.`;
    },
  },
  {
    id: 'helper',
    title: 'New laptops get 169.254 addresses',
    level: 'CCNA',
    symptom: (_d, c) => `${c.host.name} shows an APIPA address after ipconfig /renew; machines with static addresses are fine.`,
    apply: (doc) => {
      for (const d of doc.devices) {
        const i = d.interfaces.find((x) => x.helper);
        if (i) {
          const before = i.helper;
          i.helper = undefined;
          return `ip helper-address ${before} was removed from ${d.name} ${i.name}, so DHCP broadcasts are no longer relayed. Fix: ip helper-address ${before}.`;
        }
      }
      return null;
    },
  },
  {
    id: 'acl',
    title: 'Line-of-business app down for one site',
    level: 'Ops',
    symptom: (_d, c) => `${c.host.name} gets a timeout opening the business application. The server team says the server is up.`,
    apply: (doc) => {
      for (const d of doc.devices) {
        const r = d.firewall.find((x) => x.enabled && x.action === 'pass' && x.port !== 'any');
        if (r) {
          r.enabled = false;
          return `Firewall rule ${r.id} "${r.descr}" on ${d.name} was disabled; traffic now falls through to the default deny. Fix: re-enable rule ${r.id}.`;
        }
      }
      return null;
    },
  },
  {
    id: 'route',
    title: 'Branch office cannot reach HQ',
    level: 'CCNA',
    symptom: () => 'Users at a remote site lost access to headquarters systems; local internet works.',
    apply: (doc) => {
      for (const d of doc.devices) {
        const k = d.routes.findIndex((r) => r.kind === 'static');
        if (k >= 0) {
          const [r] = d.routes.splice(k, 1);
          return `Static route ${r.prefix} via ${r.via ?? r.iface} was deleted on ${d.name}. Fix: ip route ${r.prefix} ${r.via ?? r.iface}.`;
        }
      }
      return null;
    },
  },
  {
    id: 'ospf-hello',
    title: 'OSPF neighbour keeps going down',
    level: 'CCNP',
    symptom: () => 'Routes learned from a neighbouring router have disappeared from the routing table.',
    apply: (doc) => {
      for (const d of doc.devices) {
        const i = d.interfaces.find((x) => x.ospf && !x.ospf.passive);
        if (i) {
          i.ospf = { ...i.ospf!, hello: 5, dead: 20 };
          return `${d.name} ${i.name} OSPF timers were changed to hello 5 / dead 20; the neighbour still uses 10/40, so they never become adjacent. Fix: no ip ospf hello-interval / dead-interval.`;
        }
      }
      return null;
    },
  },
  {
    id: 'dup-ip',
    title: 'Intermittent drops for one user',
    level: 'Ops',
    symptom: (_d, c) => `${c.host.name} works, then drops, then works again.`,
    apply: (doc, c) => {
      const victim = deviceById(doc, c.host.id)!;
      const other = doc.devices.find((d) => d.id !== victim.id && modelOf(d).forwarding === 'host' && d.interfaces.some((i) => i.ip && i.prefix === victim.interfaces.find((x) => x.ip)?.prefix && i.ip.split('.').slice(0, 3).join('.') === victim.interfaces.find((x) => x.ip)?.ip?.split('.').slice(0, 3).join('.')));
      if (!other) return null;
      const nic = other.interfaces.find((i) => i.ip)!;
      const before = nic.ip;
      nic.ip = victim.interfaces.find((x) => x.ip)!.ip;
      nic.dhcp = false;
      return `${other.name} ${nic.name} was statically set to ${nic.ip} (was ${before}), duplicating ${victim.name}. Fix: restore ${before} or use DHCP.`;
    },
  },
];

/** Picks a challenge (random or by id) that applies to this lab and returns the faulted document. */
export function prepareChallenge(doc: LabDoc, id?: string, rnd = Math.random): { def: ChallengeDef; brief: string; fault: string; apply: (d: LabDoc) => void } | null {
  const candidates = hostsOnSwitch(doc);
  if (!candidates.length) return null;
  const defs = id ? CHALLENGES.filter((c) => c.id === id) : [...CHALLENGES].sort(() => rnd() - 0.5);
  for (const def of defs) {
    const ctxs = [...candidates].sort(() => rnd() - 0.5);
    for (const ctx of ctxs) {
      const trial = structuredClone(doc);
      const fault = def.apply(trial, ctx);
      if (!fault) continue;
      return { def, brief: def.symptom(doc, ctx), fault, apply: (d) => void def.apply(d, ctx) };
    }
  }
  return null;
}

// ---------------- goals ----------------

export interface GoalResult {
  goal: Goal;
  pass: boolean;
  actual: string;
  reason: string;
  trace?: import('./simulate').PacketTrace;
}

export function checkGoals(doc: LabDoc): GoalResult[] {
  return (doc.goals ?? []).map((g) => {
    const src = deviceById(doc, g.src);
    const dstDev = deviceById(doc, g.dst);
    const dst = dstDev ? primaryIp(dstDev) ?? g.dst : g.dst;
    if (!src) return { goal: g, pass: false, actual: 'missing', reason: 'The source device was deleted.' };
    const t = g.proto === 'icmp' ? ping(doc, src.id, dst, 1)[0] : simulatePacket(doc, { srcDevice: src.id, dst, proto: g.proto, port: g.port });
    const reached = t.status === 'delivered' || t.status === 'delayed';
    return { goal: g, pass: g.expect === 'reach' ? reached : !reached, actual: reached ? 'reached' : t.status, reason: t.reason, trace: t };
  });
}

/** Reachability matrix: ping from every host to every other host. */
export function reachMatrix(doc: LabDoc, ids: string[]): Record<string, Record<string, { ok: boolean; status: string; reason: string }>> {
  const out: Record<string, Record<string, { ok: boolean; status: string; reason: string }>> = {};
  for (const a of ids) {
    out[a] = {};
    for (const b of ids) {
      if (a === b) continue;
      const ip = primaryIp(deviceById(doc, b));
      if (!ip) {
        out[a][b] = { ok: false, status: 'no-ip', reason: 'Destination has no address.' };
        continue;
      }
      const t = ping(doc, a, ip, 1)[0];
      out[a][b] = { ok: t.status === 'delivered' || t.status === 'delayed', status: t.status, reason: t.reason };
    }
  }
  return out;
}

// ---------------- exports ----------------

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function inventoryCsv(doc: LabDoc): string {
  const rows = [['device', 'kind', 'model', 'origin', 'interface', 'type', 'mode', 'vlan', 'ip', 'prefix', 'gateway', 'mac', 'status', 'peer']];
  for (const d of doc.devices)
    for (const i of d.interfaces) {
      const c = cableOnPort(doc, d.id, i.name);
      const far = c ? (c.a.device === d.id && c.a.port === i.name ? c.b : c.a) : undefined;
      rows.push([d.name, d.kind, `${modelOf(d).vendor} ${modelOf(d).name}`, d.origin, i.name, i.type, i.mode ?? '', String(i.vlan ?? ''), i.ip ?? '', String(i.prefix ?? ''), i.gateway ?? '', i.mac, i.shutdown ? 'shutdown' : c ? 'connected' : 'notconnect', far ? `${deviceById(doc, far.device)?.name} ${far.port}` : '']);
    }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function billOfMaterials(doc: LabDoc): { item: string; qty: number; note: string }[] {
  const items = new Map<string, { qty: number; note: string }>();
  const bump = (k: string, note = '', n = 1) => items.set(k, { qty: (items.get(k)?.qty ?? 0) + n, note: items.get(k)?.note || note });
  for (const d of doc.devices.filter((x) => x.origin === 'design')) {
    const m = MODEL_BY_KEY[d.model];
    bump(`${m.vendor} ${m.name}`, m.poeBudgetW ? `PoE budget ${m.poeBudgetW} W` : m.poweredBy === 'poe' ? `PoE device, ${m.poeDrawW} W` : '');
  }
  for (const c of doc.cables) {
    const a = deviceById(doc, c.a.device);
    const b = deviceById(doc, c.b.device);
    if (a?.origin !== 'design' && b?.origin !== 'design') continue;
    const len = c.lengthM ?? 3;
    const label = c.type === 'fiber' ? `${c.fiberMode === 'smf' ? 'Single-mode' : 'Multimode OM4'} LC-LC fibre patch, ${len} m (+2 SFP optics)` : c.type === 'console' ? 'Rollover / USB console cable' : c.type === 'serial' ? 'Serial DCE/DTE cable' : c.type === 'virtual' || c.type === 'wan' ? '' : `Cat6 ${c.type === 'crossover' ? 'crossover' : 'patch'} cable, ${len} m`;
    if (label) bump(label);
  }
  return [...items.entries()].map(([item, v]) => ({ item, ...v })).sort((x, y) => x.item.localeCompare(y.item));
}

export function download(name: string, data: string | Uint8Array, type = 'application/octet-stream') {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
