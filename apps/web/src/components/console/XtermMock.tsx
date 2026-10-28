'use client';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import type { MockConsole } from '@/mock/engine';

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Line-editing terminal over the simulated lab shell: history, paste, Ctrl+C, Ctrl+L, clear. */
export function XtermMock({ con, theme }: { con: MockConsole; theme: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      convertEol: true,
      scrollback: 4000,
      theme: { background: cssVar('--pane', '#102236'), foreground: cssVar('--text', '#e4edf5'), cursor: cssVar('--action', '#3b8ee8'), selectionBackground: '#3b8ee855' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* element hidden */
      }
    });
    ro.observe(host.current);
    let line = '';
    const hist: string[] = [];
    let hi = -1;
    const write = (s: string) => term.write(s.replace(/\r?\n/g, '\r\n'));
    write(con.banner());
    write(`\n${con.prompt()}`);
    const redraw = () => {
      term.write('\x1b[2K\r');
      term.write(con.prompt() + line);
    };
    const submit = () => {
      term.write('\r\n');
      const cmd = line;
      line = '';
      hi = -1;
      if (cmd.trim()) hist.unshift(cmd);
      if (/^\s*(clear|cls)\s*$/i.test(cmd)) {
        term.clear();
        term.write('\x1b[2K\r' + con.prompt());
        return;
      }
      const out = con.exec(cmd);
      if (out) write(out + '\n');
      write(con.prompt());
    };
    const d = term.onData((data) => {
      for (const ch of data.length > 1 && !data.startsWith('\x1b') ? data.replace(/\r\n/g, '\r') : [data]) {
        if (ch === '\r') submit();
        else if (ch === '\x7f' || ch === '\b') {
          if (line.length) {
            line = line.slice(0, -1);
            term.write('\b \b');
          }
        } else if (ch === '\x03') {
          term.write('^C\r\n' + con.prompt());
          line = '';
        } else if (ch === '\x0c') {
          term.clear();
          redraw();
        } else if (ch === '\x1b[A') {
          if (hist.length && hi < hist.length - 1) {
            hi++;
            line = hist[hi];
            redraw();
          }
        } else if (ch === '\x1b[B') {
          if (hi > 0) {
            hi--;
            line = hist[hi];
          } else {
            hi = -1;
            line = '';
          }
          redraw();
        } else if (ch >= ' ' && !ch.startsWith('\x1b')) {
          line += ch;
          term.write(ch);
        }
      }
    });
    setTimeout(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      term.focus();
    }, 30);
    return () => {
      d.dispose();
      ro.disconnect();
      term.dispose();
    };
  }, [con, theme]);
  return <div ref={host} className="h-full w-full" data-testid={`terminal-${con.node}`} />;
}
