'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API_MODE, signIn } from '@/api/auth';
import { Button } from '@/components/ui';

function LoginInner() {
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);
  const returnTo = sp.get('returnTo') || '/';
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-[28px] font-semibold tracking-tight">AEGIS</p>
          <p className="text-muted">Operator cockpit for the SALONE AEGIS lab</p>
        </div>
        <div className="space-y-3 rounded-[8px] border border-line bg-pane p-5">
          <p className="text-[13.5px]">{API_MODE === 'live' ? 'Sign in with your lab identity. Multi-factor authentication is required.' : 'This cockpit is running the built-in simulated lab. No sign-in is needed.'}</p>
          <Button variant="primary" className="w-full" busy={busy} onClick={() => { setBusy(true); void signIn(returnTo); }}>
            {API_MODE === 'live' ? 'Sign in with Keycloak' : 'Open the cockpit'}
          </Button>
          <p className="text-[12px] text-faint">Reachable only over the management VPN or the jump host. Sessions end when you close the tab.</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
