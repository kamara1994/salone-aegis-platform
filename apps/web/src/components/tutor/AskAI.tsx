'use client';

// The small "Ask AI" button placed next to anything you study. Light on purpose: it only
// records what you are looking at and opens the tutor dock.
import { Sparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cx } from '@/components/ui';
import { useDashItem } from '@/components/cert/DashboardSide';
import type { TutorCtx } from '@/learn/tutorBrain';
import { useTutor } from '@/state/tutor';

export function AskAI({ ctx, label = 'Ask AI', compact, className, style }: { ctx: Omit<TutorCtx, 'where'>; label?: string; compact?: boolean; className?: string; style?: CSSProperties }) {
  const ask = useTutor((s) => s.ask);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ask({ ...ctx, where: useDashItem.getState().item });
      }}
      className={cx('ask-ai', compact && 'is-compact', className)}
      style={style}
      title="Ask the AI tutor about this"
      aria-label={`${label}: ${ctx.label}`}
      data-testid="ask-ai"
    >
      <Sparkles className="size-3.5" />
      {!compact && <span>{label}</span>}
    </button>
  );
}

/** Record a missed question so the tutor can spot repeated mix-ups. */
export const recordMiss = (label: string, text: string) => useTutor.getState().miss(label, text);

/** Tell the tutor someone looks stuck. It shows a quiet offer, never a popup. */
export const nudgeTutor = (ctx: Omit<TutorCtx, 'where'>) => useTutor.getState().setNudge({ ...ctx, where: useDashItem.getState().item });
