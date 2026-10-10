'use client';

import { dateTime, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { ClientShell } from '@/components/shells';
import { Avatar, Countdown, Icon, Loading, Pill } from '@/components/ui';
import { useApi, useLive, useSession } from '@/lib/session';

export default function ClientHome() {
  return (
    <ClientShell>
      <Dashboard />
    </ClientShell>
  );
}

function Dashboard() {
  const { user } = useSession();
  const me = useApi<any>('/me/client');
  const requests = useApi<any[]>('/requests?scope=open');
  const bookings = useApi<any>('/bookings?tab=all');
  const favs = useApi<any>('/favourites');
  useLive(['request:update', 'booking:update'], () => {
    requests.reload();
    bookings.reload();
  });

  if (me.loading) return <Loading />;
  const access = me.data?.access;
  const b = bookings.data;
  const counts = b?.counts ?? {};
  const upcoming = (b?.items ?? []).filter((x: any) => ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(x.status)).slice(0, 4);
  const toRate = (b?.items ?? []).find((x: any) => x.status === 'COMPLETED');
  const searching = (requests.data ?? []).filter((r) => ['SEARCHING', 'SENT', 'QUOTING', 'NO_WORKER'].includes(r.status));
  const tiles = [
    ['Searching', searching.length, 'text-gold-text', '/client/requests'],
    ['Upcoming', (counts.ACCEPTED ?? 0) + (counts.CONFIRMED ?? 0), 'text-info', '/client/bookings?tab=upcoming'],
    ['Happening now', counts.IN_PROGRESS ?? 0, 'text-brand', '/client/bookings?tab=active'],
    ['Completed', counts.COMPLETED ?? 0, 'text-ink', '/client/bookings?tab=completed'],
    ['Cancelled', counts.CANCELLED ?? 0, 'text-muted', '/client/bookings?tab=cancelled'],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap gap-5">
        <section className="flex min-w-0 flex-[2_1_520px] flex-col gap-4 rounded-[20px] bg-brand p-7 text-white">
          <p className="text-[#BFE3D5]">Namaste, {user?.name?.split(' ')[0] ?? 'there'}</p>
          <h1 className="text-4xl font-extrabold">What work should we get done today?</h1>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/client/new-request" className="rounded-xl bg-white px-5 py-3.5 font-bold text-brand no-underline">+ New request</Link>
            <Link href="/client/find" className="flex items-center gap-2 rounded-xl border border-[#5FA88D] px-4 py-3.5 font-semibold text-white no-underline">Browse workers</Link>
          </div>
        </section>
        <section className="card flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 p-6">
          <span className="eyebrow">Your access</span>
          {access ? (
            <>
              <div className="flex items-baseline gap-2"><b className="font-display text-5xl font-extrabold">{access.daysLeft}</b><span className="text-muted">days left</span></div>
              <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-gold" style={{ width: `${Math.min(100, (access.daysLeft / 30) * 100)}%` }} /></div>
              <p className="text-sm text-muted">Active till {dateTime(access.endsAt)} · No auto-renewal</p>
              <Link href="/client/payments" className="font-semibold text-brand">Receipts and renewal →</Link>
            </>
          ) : (
            <>
              <p>Profiles, prices and requests are locked.</p>
              <Link href="/client/access" className="self-start rounded-xl bg-gold px-4 py-3 font-bold text-ink no-underline">Unlock 30 days for ₹9</Link>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, n, color, href]) => (
          <Link key={label} href={href} className="card p-4 text-ink no-underline hover:border-muted">
            <span className="text-sm text-muted">{label}</span>
            <b className={`block font-display text-3xl font-extrabold ${color}`}>{n}</b>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
          {searching.map((r) => (
            <section key={r.id} className="card flex flex-col gap-3 border-gold-line p-5">
              <div className="flex flex-wrap justify-between gap-2"><b className="font-display text-xl">{r.service}</b><Pill status={r.status}>{statusLabel(r.status)}{r.status === 'SENT' && r.roundExpiresAt ? <> · <Countdown to={r.roundExpiresAt} /></> : null}</Pill></div>
              <p className="text-slate">{r.status === 'NO_WORKER' ? 'No worker accepted yet. Try a wider area or pick a worker yourself.' : r.status === 'QUOTING' ? `${r.quotes} quote(s) received so far.` : `Sent to ${r.notified} verified worker(s) within ${r.radiusKm} KM. The first to accept gets the job.`}</p>
              <Link href={`/client/requests/${r.id}`} className="self-start rounded-xl bg-ink px-4 py-2.5 font-semibold text-white no-underline">View status</Link>
            </section>
          ))}
          <section className="card flex flex-col p-5">
            <div className="flex items-center justify-between pb-2"><h2 className="text-xl font-bold">Upcoming bookings</h2><Link href="/client/bookings" className="font-semibold text-brand">See all</Link></div>
            {upcoming.length === 0 && <p className="py-3 text-muted">No upcoming bookings. <Link href="/client/new-request">Send a request</Link>.</p>}
            {upcoming.map((x: any) => (
              <Link key={x.id} href={`/client/bookings/${x.id}`} className="flex flex-wrap items-center gap-3.5 border-t border-line py-3 text-ink no-underline">
                <span className="min-w-0 flex-1"><b>{x.otherParty} · {x.service}</b><span className="block text-sm text-muted">{x.scheduledAt ? dateTime(x.scheduledAt) : 'As soon as possible'} · {x.priceSummary}</span></span>
                <Pill status={x.status} />
              </Link>
            ))}
          </section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="card flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">My workers</h2><Link href="/client/my-workers" className="font-semibold text-brand">All</Link></div>
            {(favs.data?.favourites ?? favs.data?.previous ?? []).length === 0 && <p className="text-sm text-muted">Save workers you like to rehire them in one tap.</p>}
            {[...(favs.data?.favourites ?? []), ...(favs.data?.previous ?? [])].slice(0, 3).map((w: any) => (
              <Link key={w.id} href={`/client/workers/${w.id}`} className="flex items-center gap-3 text-ink no-underline">
                <Avatar name={w.name} url={w.photoUrl} size={44} />
                <span className="flex-1"><b>{w.name}</b><span className="block text-[13px] text-muted">{w.services[0]} · {w.ratingAvg || 'New'} ★</span></span>
                <span className="text-[13px] font-semibold text-brand">Rehire</span>
              </Link>
            ))}
          </section>
          {toRate && (
            <section className="card flex flex-col gap-2 p-5">
              <h2 className="text-xl font-bold">Rate your last job</h2>
              <p className="text-slate">{toRate.otherParty} · {toRate.service}</p>
              <Link href={`/client/bookings/${toRate.id}`} className="font-semibold text-brand">Write a review →</Link>
            </section>
          )}
          <Link href="/client/report" className="card flex justify-between px-5 py-4 text-ink no-underline"><span className="flex items-center gap-2">{Icon.shield()}Report a problem</span><span className="text-muted">→</span></Link>
        </aside>
      </div>
    </>
  );
}
