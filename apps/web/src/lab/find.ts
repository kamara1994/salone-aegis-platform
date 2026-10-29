// Device search for the lab canvas: name, IP, MAC, VLAN and port.
import type { LabDoc } from './types';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
/** "gi0/14" matches "GigabitEthernet0/14" and "Gi0/14". */
function portMatch(name: string, needle: string) {
  const n = norm(name);
  const want = norm(needle);
  if (n === want) return true;
  const m = want.match(/^([a-z]+)([\d/.:]+)$/);
  return !!m && n.startsWith(m[1].slice(0, 2)) && n.endsWith(m[2]) && /^[a-z]+$/.test(n.slice(0, n.length - m[2].length));
}

export function findDevices(doc: LabDoc, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const vlan = q.match(/^vlan[\s:]*(\d{1,4})$/);
  if (vlan) {
    const v = Number(vlan[1]);
    return doc.devices
      .filter((d) => d.interfaces.some((i) => (i.mode !== 'trunk' && i.vlan === v) || (i.mode === 'trunk' && (i.allowedVlans === 'all' || i.allowedVlans === undefined || i.allowedVlans.includes(v)))) || (d.vlans && v in d.vlans && d.interfaces.some((i) => i.vlan === v)))
      .map((d) => d.id);
  }
  const exact = doc.devices.find((d) => d.name.toLowerCase() === q);
  if (exact) return [exact.id];
  const addr = doc.devices.filter((d) => d.interfaces.some((i) => i.ip === q || i.mac.toLowerCase() === q));
  if (addr.length) return addr.map((d) => d.id);
  // "SW1 Gi0/1" or just "Gi0/14"
  const parts = q.split(/\s+/);
  if (parts.length === 2) {
    const d = doc.devices.find((x) => x.name.toLowerCase() === parts[0] && x.interfaces.some((i) => portMatch(i.name, parts[1])));
    if (d) return [d.id];
  }
  const ports = doc.devices.filter((d) => d.interfaces.some((i) => portMatch(i.name, q) || i.description?.toLowerCase() === q));
  if (ports.length) return ports.map((d) => d.id);
  return doc.devices.filter((d) => d.name.toLowerCase().includes(q)).map((d) => d.id);
}
