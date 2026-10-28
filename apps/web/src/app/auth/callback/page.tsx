'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { completeSignIn } from '@/api/auth';

export default function Callback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    completeSignIn().then((to) => router.replace(to), (e) => setErr(String(e?.message ?? e)));
  }, [router]);
  return <main className="grid min-h-screen place-items-center text-muted">{err ? <p className="text-down">Sign-in failed: {err}. <a className="underline" href="/login">Try again</a></p> : 'Finishing sign-in…'}</main>;
}
