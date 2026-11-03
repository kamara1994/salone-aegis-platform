// Front panels drawn from data. Each CCNA lab model gets a 19-inch panel laid out like the real
// unit (port banks, uplinks, system LEDs, the MODE button), and every port LED follows the rules
// printed in the vendor hardware guide. Simplified line art, no vendor artwork.
import { MODEL_BY_KEY } from './catalog';
import { installed, modulePorts } from './modules';
import type { Device, Iface, LabDoc, LinkState } from './types';
import { cableOnPort, cableStatus, deviceById, otherEnd } from './validate';

/** What the port LEDs are showing. Catalyst switches cycle these with the MODE button. */
export type LedMode = 'STAT' | 'DUPLX' | 'SPEED' | 'PoE';

export type PanelPort = {
  iface: string;
  x: number;
  y: number;
  shape: 'rj45' | 'sfp' | 'serial' | 'console';
  /** Bottom-row RJ-45 ports are mounted upside down (latch on top). */
  flip?: boolean;
  led?: { x: number; y: number };
  label?: { x: number; y: number; text: string };
};

export type PanelItem =
  | { t: 'text'; x: number; y: number; text: string; size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; dim?: boolean }
  | { t: 'sysled'; name: string; x: number; y: number }
  | { t: 'mode'; x: number; y: number }
  | { t: 'box'; x: number; y: number; w: number; h: number; label?: string; tone: 'module' | 'blank' | 'psu' }
  | { t: 'vent'; x: number; y: number; w: number; h: number }
  | { t: 'usb'; x: number; y: number; mini?: boolean };

export interface Panel {
  model: string;
  /** Rack units tall */
  u: 1 | 2;
  w: number;
  h: number;
  items: PanelItem[];
  ports: PanelPort[];
  /** LED modes the MODE button cycles through (empty when the unit has no MODE button) */
  modes: LedMode[];
  /** Ports that are on the back of the real unit (shown on the rear panel). */
  rear: string[];
  /** Which face this art shows. */
  face: 'front' | 'rear';
  note?: string;
}

/** Panel art revision. */
export const PANEL_ART_REV = '62bf8ccd8523eb81';

export const PORT_SIZE = { rj45: { w: 26, h: 20 }, sfp: { w: 30, h: 13 }, serial: { w: 30, h: 13 }, console: { w: 26, h: 20 } } as const;
const W = 960;
const U1 = 88;

/** Catalyst-style 1U switch: LED column, MODE button, two banks of 12 copper ports, uplinks on the right. */
function catalyst(o: { model: string; series: string; prefix: string; first?: number; sys: string[]; modes: LedMode[]; uplinks: (x0: number) => PanelPort[]; right?: PanelItem[] }): Panel {
  const items: PanelItem[] = [
    { t: 'text', x: 28, y: 20, text: 'cisco', size: 11, weight: 700 },
    { t: 'text', x: 28, y: 81, text: o.series, size: 6.5, dim: true },
  ];
  // System LEDs on the left column, mode LEDs on the right column, MODE button under them.
  o.sys.forEach((name, k) => items.push({ t: 'sysled', name, x: 34, y: 32 + k * 10 }));
  o.modes.forEach((name, k) => items.push({ t: 'sysled', name, x: 88, y: 32 + k * 10 }));
  if (o.modes.length) items.push({ t: 'mode', x: 38, y: 32 + Math.max(o.sys.length, 1) * 10 + 6 });
  const ports: PanelPort[] = [];
  const first = o.first ?? 1;
  for (let bank = 0; bank < 2; bank++) {
    const x0 = 160 + bank * 198;
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 2; row++) {
        const n = bank * 12 + col * 2 + row + 1;
        const x = x0 + col * 31;
        const y = row === 0 ? 22 : 48;
        ports.push({
          iface: `${o.prefix}${n + first - 1}`,
          x,
          y,
          shape: 'rj45',
          flip: row === 1,
          led: { x: x + 13, y: row === 0 ? 16 : 72 },
          label: { x: x + 13, y: row === 0 ? 11 : 82, text: String(n) },
        });
      }
    }
  }
  ports.push(...o.uplinks(574));
  items.push(...(o.right ?? []));
  return { model: o.model, u: 1, w: W, h: U1, items, ports, modes: o.modes, rear: ['Console'], face: 'front', note: 'The RJ-45 console port is on the back of this switch.' };
}

const sfpPair = (names: string[], x0: number, labelFrom: number): PanelPort[] =>
  names.map((iface, k) => {
    const col = Math.floor(k / 2);
    const row = k % 2;
    const x = x0 + col * 40;
    const y = row === 0 ? 26 : 52;
    return { iface, x, y, shape: 'sfp', led: { x: x + 15, y: row === 0 ? 20 : 70 }, label: { x: x + 15, y: row === 0 ? 14 : 80, text: String(labelFrom + k) } };
  });

export const PANELS: Record<string, Panel> = {
  'c2960-24tt': catalyst({
    model: 'c2960-24tt',
    series: 'Catalyst 2960 Series',
    prefix: 'Fa0/',
    sys: ['SYST', 'RPS'],
    modes: ['STAT', 'DUPLX', 'SPEED'],
    uplinks: (x0) =>
      ['Gi0/1', 'Gi0/2'].map((iface, k) => ({ iface, x: x0 + 20, y: k === 0 ? 22 : 48, shape: 'rj45' as const, flip: k === 1, led: { x: x0 + 33, y: k === 0 ? 16 : 72 }, label: { x: x0 + 33, y: k === 0 ? 11 : 82, text: `${k + 1}` } })),
    right: [
      { t: 'text', x: 632, y: 48, text: '10/100/1000', size: 5.5, dim: true },
      { t: 'text', x: 930, y: 50, text: 'Catalyst 2960', size: 9, anchor: 'end', dim: true },
    ],
  }),
  c2960x24: catalyst({
    model: 'c2960x24',
    series: 'Catalyst 2960-X Series',
    prefix: 'Gi0/',
    sys: ['SYST', 'RPS'],
    modes: ['STAT', 'DUPLX', 'SPEED'],
    uplinks: (x0) => sfpPair(['Gi0/25', 'Gi0/26', 'Gi0/27', 'Gi0/28'], x0 + 12, 25),
    right: [
      { t: 'text', x: 632, y: 90, text: 'SFP', size: 5.5, anchor: 'middle', dim: true },
      { t: 'usb', x: 720, y: 40 },
      { t: 'usb', x: 750, y: 40, mini: true },
      { t: 'text', x: 930, y: 50, text: 'Catalyst 2960-X', size: 9, anchor: 'end', dim: true },
    ],
  }),
  'c3650-24ps': catalyst({
    model: 'c3650-24ps',
    series: 'Catalyst 3650 Series',
    prefix: 'Gi1/0/',
    sys: ['SYST', 'XPS', 'STACK'],
    modes: ['STAT', 'DUPLX', 'SPEED', 'PoE'],
    uplinks: (x0) =>
      ['Gi1/1/1', 'Gi1/1/2', 'Gi1/1/3', 'Gi1/1/4'].map((iface, k) => {
        const x = x0 + 26 + k * 40;
        return { iface, x, y: 40, shape: 'sfp' as const, led: { x: x + 15, y: 33 }, label: { x: x + 15, y: 62, text: String(k + 1) } };
      }),
    right: [
      { t: 'box', x: 588, y: 14, w: 182, h: 60, label: 'C3650-NM-4G', tone: 'module' },
      { t: 'usb', x: 800, y: 30, mini: true },
      { t: 'usb', x: 800, y: 50 },
      { t: 'text', x: 930, y: 50, text: 'Catalyst 3650', size: 9, anchor: 'end', dim: true },
    ],
  }),
  isr2911: isr2911(),
};

/** ISR 2911: 2U. The network ports, console and module slots are on the back, so that is the face we draw.
 * The EHWIC slots show whatever modules this router has installed. */
function isr2911(mods: Record<string, string | null> = { 'EHWIC 0': 'HWIC-2T', 'EHWIC 1': null, 'EHWIC 2': null, 'EHWIC 3': null }): Panel {
  const H = 176;
  const SLOT_XY: Record<string, [number, number]> = { 'EHWIC 0': [90, 14], 'EHWIC 1': [292, 14], 'EHWIC 2': [90, 64], 'EHWIC 3': [292, 64] };
  const items: PanelItem[] = [
    { t: 'text', x: 28, y: 22, text: 'cisco', size: 11, weight: 700 },
    { t: 'text', x: 28, y: 166, text: 'Cisco 2900 Series · rear (interfaces)', size: 6.5, dim: true },
    { t: 'box', x: 506, y: 14, w: 240, h: 94, label: 'SM 1 (blank)', tone: 'blank' },
    { t: 'box', x: 768, y: 14, w: 168, h: 148, label: 'PSU · 210 W AC', tone: 'psu' },
    { t: 'vent', x: 786, y: 44, w: 130, h: 70 },
    { t: 'sysled', name: 'PWR', x: 790, y: 132 },
    { t: 'text', x: 238, y: 122, text: 'GE 0/0', size: 6, anchor: 'middle', dim: true },
    { t: 'text', x: 288, y: 122, text: 'GE 0/1', size: 6, anchor: 'middle', dim: true },
    { t: 'text', x: 338, y: 122, text: 'GE 0/2', size: 6, anchor: 'middle', dim: true },
    { t: 'text', x: 103, y: 122, text: 'CON', size: 6, anchor: 'middle', dim: true },
    { t: 'text', x: 153, y: 122, text: 'AUX', size: 6, anchor: 'middle', dim: true },
    { t: 'usb', x: 410, y: 138, mini: true },
    { t: 'usb', x: 440, y: 138 },
  ];
  const ports: PanelPort[] = [
    { iface: 'Console', x: 90, y: 128, shape: 'console' },
    ...['Gi0/0', 'Gi0/1', 'Gi0/2'].map((iface, k) => ({ iface, x: 225 + k * 50, y: 128, shape: 'rj45' as const, led: { x: 238 + k * 50, y: 154 } })),
  ];
  for (const [slot, [bx, by]] of Object.entries(SLOT_XY)) {
    const key = mods[slot] ?? null;
    items.push({ t: 'box', x: bx, y: by, w: 196, h: 44, label: key ? `${slot} · ${key}` : `${slot} (blank)`, tone: key ? 'module' : 'blank' });
    modulePorts(key, slot).forEach((t, k) => {
      const shape = t.type === 'serial' ? 'serial' : t.type === 'sfp' ? 'sfp' : 'rj45';
      const w = PORT_SIZE[shape].w;
      const x = bx + 20 + k * (w + 12);
      const y = by + (shape === 'rj45' ? 16 : 20);
      ports.push({ iface: t.name, x, y, shape, led: { x: x + w / 2, y: by + (shape === 'rj45' ? 11 : 14) }, label: { x: x + w / 2, y: by + 42, text: t.name.split('/').pop()! } });
    });
  }
  // AUX is a real port on the 2911 but the lab does not model it.
  items.push({ t: 'box', x: 140, y: 128, w: 26, h: 20, tone: 'blank' });
  return { model: 'isr2911', u: 2, w: W, h: H, items, ports, modes: [], rear: [], face: 'rear', note: 'On a real ISR 2911 the network ports, console and module slots are on the back. The front only has status LEDs, so this is the side you cable.' };
}

/** The panel for this device, including any modules it has installed. */
export const panelOf = (d: Device): Panel | undefined => (d.model === 'isr2911' ? isr2911(installed(d)) : PANELS[d.model]);
export const panelFor = (model: string): Panel | undefined => PANELS[model];

// ---------------- LED rules ----------------

export type LedColor = 'off' | 'green' | 'amber' | 'greenamber';
/** 0 steady, 1 slow blink, 2 fast flicker (traffic) */
export type Blink = 0 | 1 | 2;
export type Lamp = { c: LedColor; blink: Blink; meaning: string };

export interface PortFacts {
  cabled: boolean;
  state?: LinkState;
  shutdown: boolean;
  err: boolean;
  blocking: boolean;
  /** STP listening/learning after the link came up (not PortFast) */
  learning: boolean;
  speed?: number;
  duplex?: 'full' | 'half';
  poeW?: number;
  poeCapable: boolean;
  /** The device is powered off */
  off: boolean;
  /** The device is in power-on self-test */
  post: boolean;
}

const OFF = (meaning: string): Lamp => ({ c: 'off', blink: 0, meaning });

/** The port LED, following the Catalyst hardware guide for each MODE setting. */
export function portLamp(mode: LedMode, f: PortFacts): Lamp {
  if (f.off) return OFF('device is powered off');
  if (f.post) return { c: 'green', blink: 1, meaning: 'power-on self-test running' };
  const linked = f.cabled && !f.shutdown && !f.err && (f.state === 'up' || f.state === 'degraded');
  if (mode === 'DUPLX') return !linked ? OFF('no link') : f.duplex === 'half' ? OFF('half duplex') : { c: 'green', blink: 0, meaning: 'full duplex' };
  if (mode === 'SPEED') {
    if (!linked) return OFF('no link');
    if ((f.speed ?? 0) >= 1000) return { c: 'green', blink: 1, meaning: '1000 Mb/s' };
    if ((f.speed ?? 0) >= 100) return { c: 'green', blink: 0, meaning: '100 Mb/s' };
    return OFF('10 Mb/s');
  }
  if (mode === 'PoE') {
    if (!f.poeCapable) return OFF('no PoE on this port');
    return (f.poeW ?? 0) > 0 ? { c: 'green', blink: 0, meaning: `supplying ${f.poeW} W PoE` } : OFF('PoE off (no powered device)');
  }
  // STAT
  if (f.shutdown) return OFF('administratively down (shutdown)');
  if (f.err) return { c: 'amber', blink: 0, meaning: 'err-disabled: the port was shut by a protection feature' };
  if (!f.cabled) return OFF('no cable');
  if (f.state === 'down' || f.state === 'disabled') return OFF('cable in, no link');
  if (f.blocking) return { c: 'amber', blink: 0, meaning: 'blocked by spanning tree (not forwarding)' };
  if (f.learning) return { c: 'amber', blink: 0, meaning: 'spanning tree listening/learning, not forwarding yet' };
  if (f.state === 'degraded') return { c: 'greenamber', blink: 0, meaning: 'link fault: errors on the link (CRC, collisions)' };
  return { c: 'green', blink: 2, meaning: 'link up, passing traffic' };
}

/** System LEDs. Mode LEDs light green for the selected mode. */
export function sysLamp(name: string, d: Device, opts: { post: boolean; mode?: LedMode; poeOver?: boolean; anyLink?: boolean }): Lamp {
  if (d.power === 'stopped') return OFF('no power');
  if (name === 'SYST' || name === 'SYS') {
    if (opts.post) return { c: 'green', blink: 1, meaning: 'booting (power-on self-test)' };
    if (d.health === 'down') return { c: 'amber', blink: 0, meaning: 'powered, but not working properly' };
    return { c: 'green', blink: 0, meaning: 'system is operating normally' };
  }
  if (name === 'PWR') return { c: 'green', blink: 0, meaning: 'power is on' };
  if (name === 'ACT') return opts.anyLink ? { c: 'green', blink: 2, meaning: 'traffic on a port' } : OFF('no traffic');
  if (name === 'RPS' || name === 'XPS') return OFF('no redundant power supply connected');
  if (name === 'STACK') return OFF('standalone, not stacked');
  if (name === 'PoE' && opts.poeOver) return { c: 'amber', blink: 0, meaning: 'PoE budget exceeded' };
  if (name === 'STAT' || name === 'DUPLX' || name === 'SPEED' || name === 'PoE')
    return opts.mode === name ? { c: 'green', blink: 0, meaning: `port LEDs show ${MODE_TEXT[name]}` } : OFF('mode not selected');
  return { c: 'green', blink: 0, meaning: 'on' };
}

export const MODE_TEXT: Record<LedMode, string> = { STAT: 'link status', DUPLX: 'duplex', SPEED: 'speed', PoE: 'PoE' };

/** Everything the LED rules need about one port, read from the lab document. */
export function portFacts(doc: LabDoc, d: Device, i: Iface, o: { blocking: boolean; learning: boolean; poeW?: number; post: boolean }): PortFacts {
  const c = cableOnPort(doc, d.id, i.name);
  const st = c ? cableStatus(doc, c) : undefined;
  let speed: number | undefined;
  let duplex: 'full' | 'half' | undefined;
  if (c && st && st.state !== 'down' && st.state !== 'disabled') {
    const far = otherEnd(c, d.id, i.name);
    const fd = deviceById(doc, far.device);
    const fi = fd?.interfaces.find((x) => x.name === far.port);
    if (fi) {
      const sp = (x: Iface) => (x.speed === 'auto' ? x.speeds : [x.speed]);
      const common = sp(i).filter((s) => sp(fi).includes(s));
      speed = common.length ? Math.max(...common) : undefined;
      const both = i.speed === 'auto' && i.duplex === 'auto' && fi.speed === 'auto' && fi.duplex === 'auto';
      duplex = i.duplex !== 'auto' ? i.duplex : both ? 'full' : 'half';
    }
  }
  return {
    cabled: !!c,
    state: st?.state,
    shutdown: i.shutdown,
    err: !!i.errDisabled,
    blocking: o.blocking,
    learning: o.learning,
    speed,
    duplex,
    poeW: o.poeW,
    poeCapable: !!MODEL_BY_KEY[d.model]?.poeBudgetW && i.type === 'copper',
    off: d.power === 'stopped',
    post: o.post,
  };
}

/** The semantic state the old Physical view exposed (kept for tests and screen readers). */
export function semanticLed(f: PortFacts): 'up' | 'degraded' | 'blocking' | 'down' | 'off' | 'admin' | 'err' {
  if (f.shutdown) return 'admin';
  if (f.err) return 'err';
  if (!f.cabled || f.off) return 'off';
  if (f.state === 'down' || f.state === 'disabled') return 'down';
  if (f.blocking) return 'blocking';
  return f.state === 'degraded' ? 'degraded' : 'up';
}
