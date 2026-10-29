'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/** Shown instead of a blank page if the Lab crashes, usually because of an incompatible saved design. */
export default function LabError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[AEGIS lab]', error);
  }, [error]);
  const clearSaved = () => {
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith('aegis.lab.')) window.localStorage.removeItem(k);
    } catch {
      /* storage blocked: nothing to clear */
    }
    window.location.reload();
  };
  return (
    <div className="mx-auto max-w-xl space-y-3 p-6" role="alert" data-testid="lab-error-boundary">
      <h1 className="text-[18px] font-semibold">The Lab could not open</h1>
      <p className="text-[13.5px] text-muted">This usually happens when a design saved in this browser by an older version does not match the current Lab. Try again first; if it keeps failing, reset the saved Lab data. Your Learn progress and other pages are not affected.</p>
      <pre className="max-h-32 overflow-auto rounded bg-ink p-2 font-mono text-[11.5px] text-muted">{error.message}</pre>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="danger" onClick={clearSaved} data-testid="lab-reset-saved">
          Reset saved Lab data and reload
        </Button>
      </div>
      <p className="text-[11.5px] text-faint">Saved layouts in this browser are removed by the reset. Export important designs first from Tools → Export once the Lab opens.</p>
    </div>
  );
}
