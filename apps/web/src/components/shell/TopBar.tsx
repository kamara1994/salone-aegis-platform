'use client';

import { Command, LogOut, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { signOut } from '@/api/auth';
import { CERTS, dashboardById, DASHBOARDS } from '@/content/certs';
import { useRouter } from 'next/navigation';
import { IconButton, Kbd } from '@/components/ui';
import { useUi } from '@/state/ui';

export function TopBar() {
  const { theme, setTheme, certId, setCert, setPalette } = useUi();
  const dash = dashboardById(certId);
  const router = useRouter();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-pane px-3 sm:gap-3">
      <Link href="/" className="flex items-baseline gap-2 pr-2">
        <span className="text-[15px] font-semibold tracking-tight">AEGIS</span>
      </Link>
      <label className="sr-only" htmlFor="cert-switch">
        Dashboard
      </label>
      <select
        id="cert-switch"
        value={dash ? certId : 'networking'}
        onChange={(e) => {
          const id = e.target.value;
          setCert(id);
          router.push(`/dashboard/${id}`);
        }}
        title={dash ? `${dash.title}: ${dash.summary}` : 'Choose a certification area to open its dashboard'}
        className="h-8 max-w-[44vw] min-w-0 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px] sm:max-w-[340px]"
        data-testid="cert-switch"
      >
        {DASHBOARDS.map((x) => (
          <option key={x.id} value={x.id}>
            {x.title}: {x.certs.map((c) => CERTS.find((k) => k.id === c)?.short).join(', ')}
          </option>
        ))}
      </select>
      <div className="flex-1" />
      <button onClick={() => setPalette(true)} className="hidden h-8 items-center gap-2 rounded-[5px] border border-line-strong px-2 text-[12.5px] text-muted hover:text-text lg:flex">
        <Command className="size-3.5" aria-hidden /> Actions <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
      <IconButton label="Sign out" onClick={() => void signOut()}>
        <LogOut className="size-4" />
      </IconButton>
    </header>
  );
}
