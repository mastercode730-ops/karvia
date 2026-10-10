'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, useLive, useRequireRole, useSession } from '@/lib/session';
import { Avatar, Icon, Loading } from './ui';

export function Logo({ light, tag }: { light?: boolean; tag?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 no-underline ${light ? 'text-white' : 'text-ink'}`} aria-label="Karvia home">
      <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] font-display text-xl font-extrabold ${tag ? 'bg-gold text-ink' : 'bg-brand text-white'}`}>K</span>
      <span className="font-display text-2xl font-extrabold tracking-tight">karvia</span>
      {tag && <span className="rounded-md bg-ink-2 px-2 py-0.5 text-xs font-bold text-gold">{tag}</span>}
    </Link>
  );
}

const PUBLIC_NAV = [
  ['/how-it-works', 'How Karvia works'],
  ['/categories', 'Categories'],
  ['/become-worker', 'Become a worker'],
  ['/help', 'Help'],
];

export function PublicHeader() {
  const path = usePathname();
  const { user } = useSession();
  const home = user ? (user.activeRole === 'WORKER' ? '/worker' : '/client') : null;
  return (
    <header className="border-b border-line bg-white">
      <div className="container-page flex flex-wrap items-center gap-x-8 gap-y-2 py-3.5">
        <Logo />
        <nav className="flex flex-1 flex-wrap gap-x-5 gap-y-1 font-medium" aria-label="Main">
          {PUBLIC_NAV.map(([href, label]) => (
            <Link key={href} href={href} className={`py-2 no-underline ${path === href ? 'border-b-2 border-brand font-bold text-brand' : 'text-ink hover:text-brand'}`}>{label}</Link>
          ))}
        </nav>
        <div className="flex gap-2.5">
          {home ? (
            <Link href={home} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white no-underline">My account</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-xl border border-line-strong px-4 py-2.5 font-semibold text-ink no-underline">Login</Link>
              <Link href="/login?as=client" className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white no-underline">Find a worker</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-[#0E1830] text-[#C3CCDA]">
      <div className="container-page flex flex-col gap-8 py-14">
        <div className="flex flex-wrap gap-8">
          <div className="flex min-w-[240px] flex-[2] flex-col gap-2.5">
            <span className="font-display text-2xl font-extrabold text-white">karvia</span>
            <p className="max-w-[36ch]">Local service marketplace. Verified workers, fast matching, simple prices.</p>
          </div>
          {[
            ['Clients', [['/how-it-works', 'How it works'], ['/categories', 'Categories'], ['/login?as=client', 'Login']]],
            ['Workers', [['/become-worker', 'Become a worker'], ['/become-worker#plans', 'Plans'], ['/login?as=worker', 'Worker login']]],
            ['Company', [['/help', 'Help & support'], ['/legal', 'Terms'], ['/legal#privacy', 'Privacy']]],
          ].map(([title, links]) => (
            <div key={title as string} className="flex min-w-[150px] flex-1 flex-col gap-2">
              <b className="text-white">{title as string}</b>
              {(links as string[][]).map(([href, label]) => (
                <Link key={href} href={href} className="text-[#C3CCDA] no-underline hover:text-white">{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[#2E3D5C] pt-5 text-sm">
          <span>© {new Date().getFullYear()} Karvia.services</span>
          <span>[Company legal name · CIN]</span>
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}

function useUnread() {
  const [unread, setUnread] = useState(0);
  const load = () => api.get('/notifications?unread=true').then((r) => setUnread(r.unread)).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  useLive(['notification'], () => setUnread((n) => n + 1));
  return unread;
}

const CLIENT_NAV = [
  ['/client', 'Home'],
  ['/client/find', 'Find worker'],
  ['/client/requests', 'My requests'],
  ['/client/bookings', 'My bookings'],
  ['/client/my-workers', 'My workers'],
];

export function ClientShell({ children }: { children: ReactNode }) {
  const { user, ready } = useRequireRole('CLIENT');
  const path = usePathname();
  const unread = useUnread();
  const [access, setAccess] = useState<{ daysLeft: number } | null | undefined>(undefined);
  useEffect(() => {
    if (user) api.get('/me/client').then((r) => setAccess(r.access)).catch(() => setAccess(null));
  }, [user, path]);

  if (!ready || !user) return <div className="container-page"><Loading /></div>;
  const active = (href: string) => (href === '/client' ? path === '/client' : path.startsWith(href));
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <Logo />
          <nav className="flex flex-1 flex-wrap gap-1 text-[15px] font-medium" aria-label="Client">
            {CLIENT_NAV.map(([href, label]) => (
              <Link key={href} href={href} className={`rounded-lg px-3 py-2 no-underline ${active(href) ? 'bg-brand-tint font-bold text-brand' : 'text-ink hover:bg-canvas'}`}>{label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href={access ? '/client/payments' : '/client/access'} className={`rounded-full px-3 py-1.5 text-sm font-semibold no-underline ${access ? 'bg-gold-tint text-gold-text' : 'bg-gold text-ink'}`}>
              {access === undefined ? '…' : access ? `₹9 access · ${access.daysLeft} days left` : 'Unlock access · ₹9'}
            </Link>
            <Link href="/client/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink">
              {Icon.bell()}
              {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-alert" />}
            </Link>
            <Link href="/client/profile" aria-label="Profile" className="no-underline"><Avatar name={user.name} size={44} /></Link>
          </div>
        </div>
      </header>
      <main className="container-page flex flex-col gap-6 py-7 pb-16">{children}</main>
    </div>
  );
}

const WORKER_NAV = [
  ['/worker', 'Dashboard'],
  ['/worker/jobs', 'Requests & jobs'],
  ['/worker/pricing', 'Services & pricing'],
  ['/worker/profile', 'Profile'],
  ['/worker/documents', 'Documents'],
  ['/worker/plan', 'My plan'],
  ['/worker/reviews', 'Reviews'],
];

export function WorkerShell({ children, allowIncomplete }: { children: ReactNode; allowIncomplete?: boolean }) {
  const { user, ready } = useRequireRole('WORKER');
  const path = usePathname();
  const unread = useUnread();
  if (!ready || !user) return <div className="container-page"><Loading /></div>;
  const active = (href: string) => (href === '/worker' ? path === '/worker' : path.startsWith(href));
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-ink">
        <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <Logo light tag="WORKER" />
          {!allowIncomplete && (
            <nav className="flex flex-1 flex-wrap gap-1 text-[15px] font-medium" aria-label="Worker">
              {WORKER_NAV.map(([href, label]) => (
                <Link key={href} href={href} className={`rounded-lg px-3 py-2 no-underline ${active(href) ? 'bg-ink-2 font-bold text-white' : 'text-[#C3CCDA] hover:text-white'}`}>{label}</Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            <Link href="/worker/notifications" aria-label="Notifications" className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-ink-2 text-white">
              {Icon.bell('#fff')}
              {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-gold" />}
            </Link>
            <Avatar name={user.name} size={42} />
          </div>
        </div>
      </header>
      <main className="container-page flex flex-col gap-6 py-7 pb-16">{children}</main>
    </div>
  );
}
