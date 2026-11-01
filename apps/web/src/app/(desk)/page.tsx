'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';
import { dashboardById } from '@/content/certs';
import { useUi } from '@/state/ui';

/** The app opens straight into the certification dashboard you used last (Networking the first time). */
export default function HomePage() {
  const router = useRouter();
  const certId = useUi((s) => s.certId);
  useEffect(() => {
    router.replace(`/dashboard/${dashboardById(certId) ? certId : 'networking'}`);
  }, [certId, router]);
  return <Loading rows={6} />;
}
