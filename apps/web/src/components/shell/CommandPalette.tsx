'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CERTS, DASHBOARDS } from '@/content/certs';
import { useUi } from '@/state/ui';
import { NAV } from './NavRail';

/** Ctrl+K: jump to a certification dashboard or a page, or switch the theme. */
export function CommandPalette() {
  const { paletteOpen, setPalette, setTheme, theme, setCert } = useUi();
  const router = useRouter();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setPalette]);

  const run = (f: () => void) => {
    setPalette(false);
    f();
  };
  const item = 'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] aria-selected:bg-pane-2';
  const group = '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint';

  return (
    <Command.Dialog open={paletteOpen} onOpenChange={setPalette} label="Command palette" className="fixed top-[12vh] left-1/2 z-50 w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[8px] border border-line-strong bg-pane" overlayClassName="fixed inset-0 z-40 bg-black/50">
      <Command.Input placeholder="Go to a dashboard or page: Networking, Lab, Learn…" className="h-11 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint" />
      <Command.List className="max-h-[60vh] overflow-auto p-2">
        <Command.Empty className="p-4 text-center text-[13px] text-muted">No matching action.</Command.Empty>
        <Command.Group heading="Dashboards" className={group}>
          {DASHBOARDS.map((d) => (
            <Command.Item key={d.id} value={`dashboard ${d.title} ${d.certs.join(' ')}`} className={item} onSelect={() => run(() => (setCert(d.id), router.push(`/dashboard/${d.id}`)))}>
              {d.title} <span className="text-faint">{d.certs.map((c) => CERTS.find((k) => k.id === c)?.short).join(', ')}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Go to" className={group}>
          {NAV.map((n) => (
            <Command.Item key={n.href} value={`go to ${n.label}`} className={item} onSelect={() => run(() => router.push(n.href))}>
              Go to {n.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="App" className={group}>
          <Command.Item value="toggle theme light dark" className={item} onSelect={() => run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
