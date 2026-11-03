// "How should new devices start?" Factory new: the device boots, a Cisco box shows its stock
// hostname and runs the initial configuration dialog, a server has no operating system until you
// install one from an ISO. Ready: the device is already booted and named, which is faster for labs.
import { useSyncExternalStore } from 'react';

export type StartMode = 'ready' | 'factory';
const KEY = 'aegis.lab.start.v1';
let mode: StartMode | null = null;
const subs = new Set<() => void>();

export function getStartMode(): StartMode {
  if (mode) return mode;
  try {
    mode = (typeof window !== 'undefined' && window.localStorage.getItem(KEY) === 'factory' ? 'factory' : 'ready') as StartMode;
  } catch {
    mode = 'ready';
  }
  return mode;
}

export function setStartMode(m: StartMode) {
  mode = m;
  try {
    window.localStorage.setItem(KEY, m);
  } catch {
    /* private mode: keep it for this page only */
  }
  subs.forEach((f) => f());
}

export function useStartMode(): StartMode {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    getStartMode,
    () => 'ready',
  );
}

/** Operating systems a blank server or VM can be installed from. Sped-up install times. */
export const ISOS = [
  { id: 'ubuntu-24.04', label: 'Ubuntu Server 24.04 LTS', os: 'Ubuntu 24.04', family: 'linux', ms: 6000 },
  { id: 'debian-12', label: 'Debian 12 (netinst)', os: 'Debian 12', family: 'linux', ms: 5000 },
  { id: 'rocky-9', label: 'Rocky Linux 9', os: 'Rocky Linux 9', family: 'linux', ms: 6000 },
  { id: 'winsrv-2022', label: 'Windows Server 2022 (evaluation)', os: 'Windows Server 2022', family: 'windows', ms: 8000 },
  { id: 'opnsense-24', label: 'OPNsense 24.7 (firewall)', os: 'OPNsense 24.7', family: 'bsd', ms: 5000 },
] as const;
export type Iso = (typeof ISOS)[number];
