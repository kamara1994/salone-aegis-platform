import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AegisProvider } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AEGIS', template: '%s · AEGIS' },
  description: 'AEGIS certification study app: labs, learning and practice for networking and security exams',
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
