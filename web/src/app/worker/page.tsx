'use client';

import { date, dateTime } from '@karvia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { WorkerShell } from '@/components/shells';
import { Button, Countdown, ErrorBox, Loading, Pill, useToast } from '@/components/ui';
import { api, errMsg, useApi, useLive, useSession } from '@/lib/session';

export default function WorkerHome() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { user } = useSession();
  const me = useApi<any>('/worker/me');
  const offers = useApi<any[]>('/worker/offers');
  const bookings = useApi<any>('/bookings?tab=all');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  useLive(['offer:new', 'offer:closed'], () => offers.reload());
  useLive(['booking:update'], () => bookings.reload());

  if (me.loading || !me.data) return <Loading />;
  const w = me.data;
  const e = w.eligibility;
  if (w.verificationStatus === 'INCOMPLETE' || w.verificationStatus === 'REJECTED') {
    return (
      <section className="card flex flex-col gap-3 p-7">
        <span className="eyebrow">Welcome, {user?.name ?? 'worker'}</span>
        <h1 className="text-3xl font-extrabold">{w.verificationStatus === 'REJECTED' ? 'Your profile needs a few changes' : 'Complete your profile'}</h1>
        <p className="text-slate">{w.completion.percent}% done. {w.verificationStatus === 'REJECTED' ? `Reason: ${w.rejectReason}` : 'Finish it and submit for verification to start getting requests.'}</p>
        <div className="h-2 max-w-md overflow-hidden rounded bg-line"><div className="h-full bg-brand" style={{ width: `${w.completion.percent}%` }} /></div>
        <Link href="/worker/register" className="self-start rounded-xl bg-brand px-5 py-3.5 font-bold text-white no-underline">Continue registration</Link>
      </section>
    );
  }

  const toggle = async () => {
    setBusy('toggle');
    try {
      await api.post('/worker/me/availability', { availability: w.availability === 'AVAILABLE' ? 'BUSY' : 'AVAILABLE' });
      me.reload();
    } catch (err) {
      toast.show(errMsg(err), 'red');
    } finally {
      setBusy(null);
    }
  };
  const respond = async (requestId: string, action: 'accept' | 'reject') => {
    setBusy(requestId);
    try {
      const r = await api.post(`/worker/offers/${requestId}/${action}`);
      if (action === 'accept') {
        toast.show('You got the job');
        location.assign(`/worker/jobs/${r.bookingId}`);
      } else toast.show('Request skipped');
    } catch (err) {
      toast.show(errMsg(err), 'red');
    } finally {
      setBusy(null);
      offers.reload();
    }
  };

  const open = (offers.data ?? []).filter((o) => o.state === 'OPEN');
  const items = bookings.data?.items ?? [];
  const counts = bookings.data?.counts ?? {};
  const available = w.availability === 'AVAILABLE';

  return (
    <>
      {toast.node}
      {['PENDING', 'UNDER_REVIEW'].includes(w.verificationStatus) && <div className="rounded-xl bg-info-tint px-4 py-3 text-info">Your profile is with our team for verification. You will get an SMS when it’s approved.</div>}
      <div className="flex flex-wrap gap-4">
        <section className="card flex min-w-0 flex-[2_1_520px] flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted">Namaste, {user?.name?.split(' ')[0]}</p>
            <h1 className="text-3xl font-extrabold">You are {available ? 'AVAILABLE' : 'BUSY'}</h1>
            <p className="text-slate">{available ? 'New requests near you will reach you here.' : 'No new requests. Turn on when you are free.'}</p>
          </div>
          <button type="button" onClick={toggle} disabled={busy === 'toggle'} aria-pressed={available} className={`flex min-h-[52px] items-center gap-3 rounded-full py-2.5 pl-2.5 pr-5 text-lg font-extrabold tracking-wide text-white ${available ? 'bg-brand' : 'bg-muted'}`}>
            <span className="h-9 w-9 rounded-full bg-white" />{available ? 'AVAILABLE' : 'BUSY'}
          </button>
        </section>
        <section className="card flex min-w-0 flex-[1_1_300px] flex-col gap-2 p-5">
          <div className="flex items-center justify-between"><b>Eligibility</b><Pill tone={e.eligible ? 'green' : 'amber'}>{e.eligible ? 'Eligible' : 'Not eligible'}</Pill></div>
          {[['Verified', e.verified], ['Trial / plan active', e.plan], ['AVAILABLE', e.available], ['Services set', e.hasServices], ['Work area set', e.location]].map(([k, ok]) => (
            <div key={k as string} className="flex justify-between text-sm"><span>{k}</span><b className={ok ? 'text-brand' : 'text-alert-text'}>{ok ? '✓ Yes' : '✕ No'}</b></div>
          ))}
          {!e.plan && w.verificationStatus === 'VERIFIED' && <Link href="/worker/plan" className="mt-1 font-semibold">Renew plan →</Link>}
        </section>
      </div>

      {offers.error && <ErrorBox message={offers.error.message} />}
      {open.map((o) => (
        <section key={o.offerId} className="card flex flex-wrap items-center gap-5 border-2 border-gold p-6 shadow-[0_18px_40px_-22px_rgba(19,33,60,.35)]">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-[7px] border-gold-tint border-t-gold font-display text-2xl font-extrabold">
            {o.bookingType === 'QUOTE' ? 'Quote' : <Countdown to={o.expiresAt} onDone={() => offers.reload()} />}
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <span className="text-[13px] font-bold tracking-wide text-gold-text">NEW REQUEST · {o.bookingType}</span>
            <h2 className="text-2xl font-bold">{o.service} · {o.area}</h2>
            <p className="text-slate">{o.distanceKm} KM away · {o.when} · “{o.description}”{o.mediaCount ? ` · ${o.mediaCount} attachment(s)` : ''}</p>
            <p className="text-sm text-muted">Exact address is shared after you accept.</p>
          </div>
          {o.bookingType === 'QUOTE' ? (
            <Link href={`/worker/jobs?quote=${o.requestId}`} className="rounded-xl bg-info px-5 py-4 font-bold text-white no-underline">Send quote</Link>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              <Button size="lg" variant="secondary" disabled={!!busy} onClick={() => respond(o.requestId, 'reject')}>Reject</Button>
              <Button size="lg" loading={busy === o.requestId} onClick={() => respond(o.requestId, 'accept')}>Accept job</Button>
            </div>
          )}
        </section>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['New requests', open.length, 'text-gold-text', '/worker/jobs'],
          ['Accepted', counts.ACCEPTED ?? 0, 'text-brand', '/worker/jobs?tab=upcoming'],
          ['Confirmed', counts.CONFIRMED ?? 0, 'text-info', '/worker/jobs?tab=upcoming'],
          ['Completed', w.jobsDone, 'text-ink', '/worker/jobs?tab=completed'],
          ['Rating', w.ratingCount ? `${w.ratingAvg} ★` : 'New', 'text-ink', '/worker/reviews'],
        ].map(([l, n, c, href]) => (
          <Link key={l as string} href={href as string} className="card p-4 text-ink no-underline"><span className="text-sm text-muted">{l}</span><b className={`block font-display text-3xl font-extrabold ${c}`}>{n}</b></Link>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[2_1_520px] flex-col p-5">
          <div className="flex justify-between pb-2"><h2 className="text-xl font-bold">Today & upcoming</h2><Link href="/worker/jobs" className="font-semibold">All jobs</Link></div>
          {items.filter((b: any) => ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)).length === 0 && <p className="py-3 text-muted">No upcoming jobs yet.</p>}
          {items.filter((b: any) => ['ACCEPTED', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status)).map((b: any) => (
            <Link key={b.id} href={`/worker/jobs/${b.id}`} className="flex flex-wrap items-center gap-3.5 border-t border-line py-3 text-ink no-underline">
              <b className="w-36">{b.scheduledAt ? dateTime(b.scheduledAt) : 'ASAP'}</b><span className="flex-1">{b.service} · {b.otherParty}</span><Pill status={b.status} />
            </Link>
          ))}
        </section>
        {w.plan && (
          <section className={`flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-2xl p-5 ${w.plan.daysLeft <= 3 ? 'bg-gold-tint' : 'card'}`}>
            <b className="font-display text-xl">{w.plan.kind === 'WORKER_TRIAL' ? 'Free trial' : 'Karvia Pro'} · {w.plan.daysLeft} days left</b>
            <p className="text-[15px]">Active till {date(w.plan.endsAt)}. Nothing is charged automatically.</p>
            <Link href="/worker/plan" className="self-start rounded-xl bg-ink px-4 py-2.5 font-semibold text-white no-underline">See plan</Link>
          </section>
        )}
      </div>
    </>
  );
}
