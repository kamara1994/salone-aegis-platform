import { nodeByName } from '../lab';
import type { Shell, ShellCtx } from './common';
import { IosShell } from './ios';
import { LinuxShell } from './linux';
import { OpnsenseShell } from './opnsense';
import { WindowsShell } from './windows';

export type { Shell, ShellCtx } from './common';

export function createShell(ctx: ShellCtx, recentAlerts?: () => { at: string; rule: string; level: number; agent: string }[]): Shell | null {
  const n = nodeByName(ctx.node);
  if (!n) return null;
  switch (n.os) {
    case 'windows':
      return new WindowsShell(ctx);
    case 'ios':
      return new IosShell(ctx);
    case 'opnsense':
      return new OpnsenseShell(ctx);
    case 'linux':
      return new LinuxShell(ctx, recentAlerts);
    default:
      return null;
  }
}
