'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/components/ui';
import { useUi } from '@/state/ui';

export function Toasts() {
  const { toasts, dismiss } = useUi();
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cx('pointer-events-auto rounded-[6px] border bg-pane p-3 text-[13px]', t.tone === 'danger' ? 'border-down' : t.tone === 'warning' ? 'border-degraded' : t.tone === 'success' ? 'border-healthy' : 'border-line-strong')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.href ? <Link href={t.href} className="hover:underline" onClick={() => dismiss(t.id)}>{t.title}</Link> : t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-2 text-muted">{t.body}</p>}
              {t.action && (
                <button
                  className="mt-1 rounded border border-line-strong px-2 py-0.5 text-[12px] font-medium hover:border-action"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                  data-testid="toast-action"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-faint hover:text-text">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
