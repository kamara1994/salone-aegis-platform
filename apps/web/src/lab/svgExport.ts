// Exports the lab design as a standalone SVG diagram (devices, cables with port labels, notes and zones).
import type { LabDoc } from './types';
import { cableStatus } from './validate';

const W = 128;
const H = 104;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const STATE_COLOR: Record<string, string> = { up: '#2fb36a', degraded: '#e5a23a', down: '#e5484d', disabled: '#8a9bb0' };
const NOTE: Record<string, string> = { blue: '#3b8ee8', green: '#2fb36a', amber: '#e5a23a', red: '#e5484d', grey: '#8a9bb0' };

export function labToSvg(doc: LabDoc, title = 'Lab diagram'): string {
  const notes = doc.annotations ?? [];
  const xs = [...doc.devices.map((d) => [d.x, d.x + W]), ...notes.map((n) => [n.x, n.x + n.w])].flat();
  const ys = [...doc.devices.map((d) => [d.y, d.y + H]), ...notes.map((n) => [n.y, n.y + n.h])].flat();
  const pad = 40;
  const minX = (xs.length ? Math.min(...xs) : 0) - pad;
  const minY = (ys.length ? Math.min(...ys) : 0) - pad - 24;
  const width = (xs.length ? Math.max(...xs) : 400) - minX + pad;
  const height = (ys.length ? Math.max(...ys) : 300) - minY + pad;
  const byId = new Map(doc.devices.map((d) => [d.id, d]));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${Math.round(width)}" height="${Math.round(height)}" font-family="system-ui, sans-serif">`);
  out.push(`<title>${esc(title)}</title>`);
  out.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#0d1a2a"/>`);
  out.push(`<text x="${minX + 16}" y="${minY + 24}" fill="#e6edf5" font-size="15" font-weight="600">${esc(title)}</text>`);
  out.push('<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>');
  for (const n of notes) {
    const c = NOTE[n.color] ?? '#8a9bb0';
    if (n.kind === 'rect' || n.kind === 'text') out.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="${c}" fill-opacity="${n.kind === 'text' ? 0.13 : 0.05}" stroke="${c}" stroke-width="2" ${n.kind === 'rect' ? 'stroke-dasharray="6 4"' : ''}/>`);
    if (n.kind === 'ellipse') out.push(`<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${c}" fill-opacity="0.05" stroke="${c}" stroke-width="2" stroke-dasharray="6 4"/>`);
    if (n.kind === 'arrow') {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      out.push(`<g transform="rotate(${n.rotate ?? 0} ${cx} ${cy})"><line x1="${n.x + n.w * 0.06}" y1="${cy}" x2="${n.x + n.w * 0.94}" y2="${cy}" stroke="${c}" stroke-width="3" marker-end="url(#ah)"/></g>`);
    }
    const lines = n.text.split('\n');
    lines.forEach((l, i) => out.push(`<text x="${n.kind === 'arrow' ? n.x + n.w / 2 : n.x + 8}" y="${n.y + 20 + i * 16}" ${n.kind === 'arrow' ? 'text-anchor="middle"' : ''} fill="${n.kind === 'text' ? '#e6edf5' : c}" font-size="${n.kind === 'label' ? 15 : 12.5}" font-weight="${n.kind === 'text' ? 400 : 600}">${esc(l)}</text>`));
  }
  for (const c of doc.cables) {
    const a = byId.get(c.a.device);
    const b = byId.get(c.b.device);
    if (!a || !b) continue;
    const st = c.disabled ? 'disabled' : cableStatus(doc, c).state;
    const color = STATE_COLOR[st] ?? '#8a9bb0';
    const [ax, ay, bx, by] = [a.x + W / 2, a.y + H / 2, b.x + W / 2, b.y + H / 2];
    const dash = c.type === 'console' ? 'stroke-dasharray="2 4"' : c.type.includes('fiber') || c.type.includes('smf') || c.type.includes('mmf') ? 'stroke-dasharray="10 4"' : '';
    const path = c.bend ? `M${ax} ${ay} Q${c.bend.x} ${c.bend.y} ${bx} ${by}` : `M${ax} ${ay} L${bx} ${by}`;
    out.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" ${dash}><title>${esc(`${a.name} ${c.a.port} ↔ ${b.name} ${c.b.port} (${c.type}, ${st})`)}</title></path>`);
    const lbl = (x1: number, y1: number, x2: number, y2: number, t: string) => {
      const x = x1 + (x2 - x1) * 0.28;
      const y = y1 + (y2 - y1) * 0.28;
      out.push(`<text x="${x}" y="${y}" fill="#b7c4d3" font-size="10" text-anchor="middle" paint-order="stroke" stroke="#0d1a2a" stroke-width="3">${esc(t)}</text>`);
    };
    lbl(ax, ay, bx, by, c.a.port);
    lbl(bx, by, ax, ay, c.b.port);
  }
  for (const d of doc.devices) {
    const ip = d.interfaces.find((i) => i.ip)?.ip;
    out.push(`<g><rect x="${d.x}" y="${d.y}" width="${W}" height="${H}" rx="10" fill="#15283d" stroke="#3b5675" stroke-width="1.5"/>`);
    out.push(`<text x="${d.x + W / 2}" y="${d.y + 38}" fill="#8fb3d9" font-size="11" text-anchor="middle">${esc(d.kind)}</text>`);
    out.push(`<text x="${d.x + W / 2}" y="${d.y + 58}" fill="#e6edf5" font-size="13" font-weight="600" text-anchor="middle">${esc(d.name)}</text>`);
    out.push(`<text x="${d.x + W / 2}" y="${d.y + 76}" fill="#8a9bb0" font-size="10" text-anchor="middle">${esc(d.model)}</text>`);
    if (ip) out.push(`<text x="${d.x + W / 2}" y="${d.y + 92}" fill="#8a9bb0" font-size="10" text-anchor="middle">${esc(ip)}</text>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}
