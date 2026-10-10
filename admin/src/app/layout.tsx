import type { Metadata } from 'next';
import { Baloo_2, Hind } from 'next/font/google';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const display = Baloo_2({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });
const body = Hind({ subsets: ['latin', 'devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = { title: { default: 'Karvia Admin', template: '%s · Karvia Admin' }, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-canvas">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
