'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { isSignedIn } from '@/api/auth';
import { AppShell } from '@/components/shell/AppShell';

export default function DeskLayout({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(false);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    isSignedIn().then((s) => (s ? setOk(true) : router.replace(`/login?returnTo=${encodeURIComponent(path)}`)));
  }, [router, path]);
  if (!ok) return <div className="grid h-screen place-items-center text-muted">Checking your session…</div>;
  return <AppShell>{children}</AppShell>;
}
