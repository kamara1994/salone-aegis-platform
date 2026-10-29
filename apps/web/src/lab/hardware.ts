// Rear-panel hardware for each catalog model: power supplies, fans, module slots and system LEDs.
// Drawn in the Physical view. Generic and simplified; no vendor artwork.
import type { DeviceModel } from './catalog';
import type { Device } from './types';

export interface Psu { slot: string; watts: number; kind: 'ac' | 'dc' | 'external' | 'poe' }
export interface Slot { name: string; module?: string }
export interface Hardware { psus: Psu[]; fans: number; slots: Slot[]; leds: string[]; redundant: boolean }

const H: Record<string, Partial<Hardware>> = {
  isr4331: { psus: [{ slot: 'PSU', watts: 250, kind: 'ac' }], fans: 2, slots: [{ name: 'NIM 0/1', module: 'NIM-2T (2 serial)' }, { name: 'NIM 0/2' }, { name: 'SM 1' }], leds: ['SYS', 'ACT', 'PWR'] },
  isr1941: { psus: [{ slot: 'PSU', watts: 110, kind: 'ac' }], fans: 1, slots: [{ name: 'EHWIC 0', module: 'HWIC-2T (2 serial)' }, { name: 'EHWIC 1' }], leds: ['SYS', 'ACT', 'PWR'] },
  c2960x24: { psus: [{ slot: 'PS', watts: 250, kind: 'ac' }], fans: 1, slots: [{ name: 'FlexStack' }], leds: ['SYST', 'STAT', 'DUPLX', 'SPEED'] },
  'c9300-24t': { psus: [{ slot: 'PS-A', watts: 715, kind: 'ac' }, { slot: 'PS-B', watts: 715, kind: 'ac' }], fans: 3, slots: [{ name: 'Network module', module: 'C9300-NM-4G (4 x SFP)' }, { name: 'StackWise' }], leds: ['SYST', 'STAT', 'PoE', 'STACK'] },
  c2960x24ps: { psus: [{ slot: 'PS', watts: 640, kind: 'ac' }], fans: 2, slots: [{ name: 'FlexStack' }], leds: ['SYST', 'STAT', 'PoE', 'DUPLX'] },
  dec2750: { psus: [{ slot: 'PSU', watts: 60, kind: 'external' }], fans: 2, slots: [], leds: ['PWR', 'HDD', 'STATUS'] },
  r650: { psus: [{ slot: 'PSU1', watts: 800, kind: 'ac' }, { slot: 'PSU2', watts: 800, kind: 'ac' }], fans: 6, slots: [{ name: 'PCIe 1', module: 'Dual-port 10GbE' }, { name: 'PCIe 2' }, { name: 'iDRAC', module: 'Out-of-band management' }], leds: ['PWR', 'HEALTH', 'ID'] },
  'services-server': { psus: [{ slot: 'PSU1', watts: 550, kind: 'ac' }, { slot: 'PSU2', watts: 550, kind: 'ac' }], fans: 4, slots: [{ name: 'PCIe 1' }], leds: ['PWR', 'HEALTH'] },
  c9800l: { psus: [{ slot: 'PSU', watts: 115, kind: 'external' }], fans: 1, slots: [], leds: ['SYS', 'ALM', 'HA'] },
  optiplex: { psus: [{ slot: 'PSU', watts: 260, kind: 'ac' }], fans: 1, slots: [{ name: 'PCIe x16' }], leds: ['PWR', 'HDD'] },
  'legacy-pc': { psus: [{ slot: 'PSU', watts: 300, kind: 'ac' }], fans: 1, slots: [{ name: 'PCI 1' }], leds: ['PWR', 'HDD'] },
  'kali-workstation': { psus: [{ slot: 'PSU', watts: 500, kind: 'ac' }], fans: 2, slots: [{ name: 'PCIe x16', module: 'GPU' }], leds: ['PWR', 'HDD'] },
  thinkpad: { psus: [{ slot: 'USB-C 65 W', watts: 65, kind: 'external' }], fans: 1, slots: [], leds: ['PWR', 'CHG'] },
  'network-printer': { psus: [{ slot: 'PSU', watts: 600, kind: 'ac' }], fans: 1, slots: [], leds: ['READY', 'DATA', 'ATTN'] },
};

export function hardwareOf(m: DeviceModel): Hardware {
  const h = H[m.key];
  if (h) return { psus: h.psus ?? [], fans: h.fans ?? 0, slots: h.slots ?? [], leds: h.leds ?? ['PWR'], redundant: (h.psus?.length ?? 0) > 1 };
  if (m.poweredBy === 'poe') return { psus: [{ slot: 'PoE (802.3)', watts: m.poeDrawW ?? 0, kind: 'poe' }], fans: 0, slots: [], leds: ['PWR', 'STATUS'], redundant: false };
  // Virtual and cloud objects have no physical hardware.
  return { psus: [], fans: 0, slots: [], leds: [], redundant: false };
}

/** PSUs that are delivering power right now. */
export const livePsus = (d: Device, hw: Hardware) => hw.psus.filter((p) => p.kind !== 'poe' && !(d.psuOff ?? []).includes(p.slot));
