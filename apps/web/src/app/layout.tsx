import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AegisProvider } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AEGIS cockpit', template: '%s · AEGIS' },
  description: 'Operator cockpit for the SALONE AEGIS simulated enterprise lab',
};
export const viewport: Viewport = { themeColor: '#0b1826', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <AegisProvider>{children}</AegisProvider>
      </body>
    </html>
  );
}
