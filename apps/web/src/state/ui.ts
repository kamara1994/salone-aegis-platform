import { create } from 'zustand';
import { dashboardById, dashboardOfCert } from '@/content/certs';

export type Theme = 'dark' | 'light';

export interface Toast {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
  href?: string;
  /** one button in the toast, e.g. Undo */
  action?: { label: string; onClick: () => void };
}

const read = <T,>(k: string, d: T): T => {
  if (typeof window === 'undefined') return d;
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

interface UiState {
  theme: Theme;
  clientId: string | 'all';
  /** Certification focus chosen in the top bar ('all' = no focus) */
  certId: string | 'all';
  paletteOpen: boolean;
  notificationsOpen: boolean;
  toasts: Toast[];
  debriefTicketId: string | null;
  consoleTabs: { key: string; nodeId: string; ticketId?: string }[];
  activeConsole: string | null;
  dockOpen: boolean;
  openConsole(nodeId: string, ticketId?: string): void;
  closeConsole(key: string): void;
  setDock(open: boolean): void;
  setActiveConsole(key: string): void;
  setTheme(t: Theme): void;
  setClient(id: string | 'all'): void;
  setCert(id: string | 'all'): void;
  setPalette(open: boolean): void;
  setNotifications(open: boolean): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismiss(id: string): void;
  openDebrief(ticketId: string | null): void;
  hydrate(): void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: 'dark',
  clientId: 'all',
  certId: 'all',
  paletteOpen: false,
  notificationsOpen: false,
  toasts: [],
  debriefTicketId: null,
  consoleTabs: [],
  activeConsole: null,
  dockOpen: false,
  openConsole(nodeId, ticketId) {
    const key = `${nodeId}:${ticketId ?? ''}`;
    const tabs = get().consoleTabs;
    set({ consoleTabs: tabs.some((t) => t.key === key) ? tabs : [...tabs, { key, nodeId, ticketId }], activeConsole: key, dockOpen: true });
  },
  closeConsole(key) {
    const tabs = get().consoleTabs.filter((t) => t.key !== key);
    set({ consoleTabs: tabs, activeConsole: tabs.at(-1)?.key ?? null, dockOpen: tabs.length > 0 && get().dockOpen });
  },
  setDock: (dockOpen) => set({ dockOpen }),
  setActiveConsole: (activeConsole) => set({ activeConsole, dockOpen: true }),
  setTheme(theme) {
    write('aegis.theme', theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  setClient(clientId) {
    write('aegis.client', clientId);
    set({ clientId });
  },
  setCert(certId) {
    write('aegis.cert', certId);
    set({ certId });
  },
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setNotifications: (notificationsOpen) => set({ notificationsOpen }),
  toast(t) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.tone === 'danger' ? 9000 : 6000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  openDebrief: (debriefTicketId) => set({ debriefTicketId }),
  hydrate() {
    const theme = read<Theme>('aegis.theme', 'dark');
    document.documentElement.dataset.theme = theme;
    // certId holds a dashboard id; choices saved before dashboards existed were certification ids.
    let certId = read<string>('aegis.cert', 'all');
    if (certId === 'advanced-networking') certId = 'networking'; // merged into Networking
    if (certId !== 'all' && !dashboardById(certId)) certId = dashboardOfCert(certId)?.id ?? 'all';
    set({ theme, clientId: read<string>('aegis.client', 'all'), certId });
  },
}));

interface LiveState {
  typing: Record<string, boolean>;
  flows: Record<string, { bytes_per_s: number; allowed: number; denied: number; top_app?: string }>;
  connection: 'connecting' | 'open' | 'reconnecting' | 'closed';
  jobs: Record<string, { status: 'running' | 'completed' | 'failed'; error?: string; result?: Record<string, unknown> }>;
}
export const useLive = create<LiveState>(() => ({ typing: {}, flows: {}, connection: 'connecting', jobs: {} }));
