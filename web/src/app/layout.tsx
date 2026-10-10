import type { Metadata, Viewport } from 'next';
import { Baloo_2, Hind } from 'next/font/google';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const display = Baloo_2({ subsets: ['latin', 'devanagari'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });
const body = Hind({ subsets: ['latin', 'devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Karvia · Verified local workers near you', template: '%s · Karvia' },
  description: 'Find verified plumbers, electricians, drivers, maids, labour and more within 5 KM. ₹9 for 30 days of access.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B6E4F' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
