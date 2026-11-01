'use client';

import { useState } from 'react';
import { Button, ConfirmDialog, Kbd, Pane } from '@/components/ui';
import { useUi } from '@/state/ui';

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'K'], 'Jump to any certification dashboard or page'],
  [['Ctrl', '`'], 'Open or hide the lab terminal'],
  [['?'], 'IOS help for what you have typed (show ?, sh?)'],
  [['Tab'], 'Complete the IOS command'],
  [['Up', 'Down'], 'Command history in the terminal'],
  [['Ctrl', 'U'], 'Clear the line'],
  [['Ctrl', 'Z'], 'Leave configuration mode'],
  [['Ctrl', 'L'], 'Clear the terminal'],
  [['C'], 'Cable tool on the lab canvas'],
  [['F'], 'Fit the network to the screen'],
  [['Esc'], 'Close dialogs and stop the current tool'],
];

export default function SettingsPage() {
  const { theme, setTheme, toast } = useUi();
  const [resetOpen, setResetOpen] = useState(false);
  const resetProgress = () => {
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith('aegis.')) window.localStorage.removeItem(k);
    } catch {
      /* storage blocked */
    }
    toast({ tone: 'info', title: 'Progress reset', body: 'Lab attempts, scores and saved designs in this browser were cleared.' });
    window.location.assign('/');
  };
  return (
    <div className="max-w-3xl space-y-3 p-4" data-testid="settings">
      <h1 className="text-[18px] font-semibold">Settings</h1>
      <Pane title="Appearance">
        <div className="flex items-center gap-4 p-4 text-[13px]">
          <div className="flex-1">
            <p className="font-medium">Theme</p>
            <p className="text-muted">Dark is easier on the eyes for long lab sessions.</p>
          </div>
          <div className="flex rounded-[6px] border border-line-strong p-0.5" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={theme === t ? 'rounded-[4px] bg-action px-3 py-1 text-white' : 'rounded-[4px] px-3 py-1 text-muted hover:text-text'}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>
      </Pane>
      <Pane title="Keyboard">
        <ul className="divide-y divide-line text-[13px]">
          {SHORTCUTS.map(([keys, what]) => (
            <li key={what} className="flex items-center gap-3 px-4 py-2">
              <span className="flex w-28 shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
      </Pane>
      <Pane title="Your data">
        <div className="flex items-start gap-4 p-4 text-[13px]">
          <div className="flex-1">
            <p className="font-medium">Reset my progress</p>
            <p className="text-muted">Clears lab attempts, scores, saved lab designs and projects stored in this browser.</p>
          </div>
          <Button variant="danger" onClick={() => setResetOpen(true)}>
            Reset progress…
          </Button>
        </div>
      </Pane>
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={resetProgress} typed="RESET" title="Reset your progress?" confirmLabel="Reset everything" body="Lab attempts, scores, saved designs and projects in this browser are deleted. This cannot be undone." />
    </div>
  );
}
