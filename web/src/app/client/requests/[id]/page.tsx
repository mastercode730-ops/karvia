'use client';

import { dateTime, rupees, time } from '@karvia/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ClientShell } from '@/components/shells';
import { Avatar, Button, Countdown, ErrorBox, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useLive } from '@/lib/session';

const STEPS = ['Requested', 'Searching', 'Sent', 'Accepted', 'Confirmed', 'In progress', 'Completed'];

export default function RequestDetail() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: r, error, loading, reload } = useApi<any>(`/requests/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  useLive(['request:update'], (p) => p?.id === id && reload());

  if (loading && !r) return <Loading />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!r) return null;

  const act = async (key: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(key);
    try {
      const out = await fn();
      if (msg) toast.show(msg);
      if (out?.bookingId) return router.push(`/client/bookings/${out.bookingId}`);
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
      reload();
    } finally {
      setBusy(null);
    }
  };
  const stage = { SEARCHING: 1, SENT: 2, QUOTING: 2, NO_WORKER: 1, ACCEPTED: 3, CANCELLED: -1, EXPIRED: -1 }[r.status as string] ?? 0;

  return (
    <>
      {toast.node}
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div><p className="text-muted">Request {r.code} · {r.service.name}</p><h1 className="text-4xl font-extrabold">Request status</h1></div>
        {['SEARCHING', 'SENT', 'QUOTING', 'NO_WORKER'].includes(r.status) && (
          <Button variant="secondary" loading={busy === 'cancel'} onClick={() => act('cancel', () => api.post(`/requests/${id}/cancel`, { reason: 'Cancelled by client' }), 'Request cancelled')}>Cancel request</Button>
        )}
      </div>

      <ol className="card flex gap-1.5 overflow-x-auto p-4 text-sm font-semibold">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`whitespace-nowrap rounded-lg px-3 py-2 ${i < stage ? 'bg-brand-tint text-brand' : i === stage ? 'bg-brand text-white' : 'bg-canvas text-muted'}`}>{i < stage ? '✓ ' : ''}{s}</span>
            {i < STEPS.length - 1 && <span aria-hidden className="text-line-strong">—</span>}
          </li>
        ))}
      </ol>

      {r.status === 'SENT' && (
        <Section className="items-center !border-gold-line text-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-gold-tint border-t-gold font-display text-3xl font-extrabold">{r.roundExpiresAt ? <Countdown to={r.roundExpiresAt} onDone={() => setTimeout(reload, 2500)} /> : '…'}</div>
          <h2 className="text-2xl font-bold">Finding a {r.service.name.toLowerCase()} near you</h2>
          <p className="text-slate">Sent to {r.notified} verified worker(s) within {r.radiusKm} KM. The first to accept gets your job.</p>
        </Section>
      )}
      {r.status === 'SEARCHING' && <Section><p>Looking for eligible workers within {r.radiusKm} KM…</p></Section>}
      {r.status === 'NO_WORKER' && (
        <Section title="No worker accepted yet">
          <p className="text-slate">Aapki search jaari hai. Suitable worker milte hi notify kiya jayega. You can also try these:</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" loading={busy === 'retry'} onClick={() => act('retry', () => api.post(`/requests/${id}/retry`), 'Searching a wider area')}>Search a wider area</Button>
            <Link href={`/client/find?service=${r.service.id}`} className="rounded-xl border border-line-strong px-4 py-3 font-semibold text-ink no-underline">Pick a worker myself</Link>
            <Link href={`/client/new-request?service=${r.service.id}`} className="rounded-xl border border-line-strong px-4 py-3 font-semibold text-ink no-underline">Change time</Link>
          </div>
        </Section>
      )}
      {r.status === 'ACCEPTED' && r.acceptedWorker && (
        <Section className="!border-2 !border-brand">
          <Pill tone="green">Accepted</Pill>
          <div className="flex items-center gap-3"><Avatar name={r.acceptedWorker.name} url={api.fileUrl(r.acceptedWorker.photoUrl)} size={56} /><div><b className="text-lg">{r.acceptedWorker.name} accepted</b><p className="text-sm text-muted">★ {r.acceptedWorker.ratingAvg || 'New'} · {r.acceptedWorker.jobsDone} jobs · {r.acceptedWorker.distanceKm} KM away</p></div></div>
          <Link href={`/client/bookings/${r.bookingId}`} className="rounded-xl bg-brand py-3.5 text-center font-bold text-white no-underline">Open booking to confirm</Link>
        </Section>
      )}
      {(r.status === 'CANCELLED' || r.status === 'EXPIRED') && <Section><p>This request was {r.status.toLowerCase()}{r.cancelReason ? `: ${r.cancelReason}` : ''}.</p></Section>}

      {(r.status === 'QUOTING' || r.quotes.length > 0) && (
        <>
          <div className="rounded-xl bg-gold-tint px-4 py-3"><b>Each quote is valid for 30 minutes.</b> You can accept only one. Rejecting or ignoring a quote is free.</div>
          {r.quotes.length === 0 && <Section><p className="text-muted">Waiting for quotes from {r.notified} worker(s)…</p></Section>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            {r.quotes.map((q: any) => (
              <section key={q.id} className="card flex flex-col gap-3.5 p-5">
                <div className="flex items-center justify-between"><Pill tone="grey">Quote v{q.version}</Pill>{q.status === 'ACTIVE' && (q.expired ? <span className="text-sm font-bold text-alert-text">Expired</span> : <span className="text-sm font-bold text-gold-text">⏱ <Countdown to={q.expiresAt} onDone={reload} /> left</span>)}</div>
                {q.worker && <Link href={`/client/workers/${q.worker.id}`} className="flex items-center gap-3 text-ink no-underline"><Avatar name={q.worker.name} url={api.fileUrl(q.worker.photoUrl)} size={46} /><div><b>{q.worker.name}</b><p className="text-sm text-muted">★ {q.worker.ratingAvg || 'New'} · {q.worker.distanceKm} KM · {q.worker.experienceYears ?? 0} yrs</p></div></Link>}
                <dl className="grid grid-cols-[1fr_auto] gap-2">
                  <dt>Service charge</dt><dd>{rupees(q.servicePaise)}</dd>
                  <dt>Material / extra</dt><dd>{rupees(q.materialPaise)}</dd>
                  {q.taxPaise > 0 && (<><dt className="text-muted">Tax</dt><dd className="text-muted">{rupees(q.taxPaise)}</dd></>)}
                  <dt className="border-t border-line pt-2 font-bold">Total</dt><dd className="border-t border-line pt-2 font-display text-xl font-extrabold">{rupees(q.totalPaise)}</dd>
                </dl>
                {q.note && <p className="rounded-lg bg-canvas p-2.5 text-sm text-slate">“{q.note}”</p>}
                {q.status === 'ACTIVE' && !q.expired && (
                  <div className="flex gap-2">
                    <Button className="flex-1" loading={busy === q.id} onClick={() => act(q.id, () => api.post(`/requests/quotes/${q.id}/accept`))}>Accept</Button>
                    <Button className="flex-1" variant="secondary" disabled={!!busy} onClick={() => act(`r${q.id}`, () => api.post(`/requests/quotes/${q.id}/reject`), 'Quote rejected')}>Reject</Button>
                  </div>
                )}
                {q.status === 'ACCEPTED' && <Pill tone="green">Accepted</Pill>}
              </section>
            ))}
          </div>
        </>
      )}

      <Section title="Details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Work</dt><dd>{r.description}{r.quantity > 1 ? ` · ${r.quantity} workers` : ''}</dd>
          <dt className="text-muted">When</dt><dd>{r.scheduledAt ? dateTime(r.scheduledAt) : r.bookingType === 'QUOTE' ? 'Flexible' : 'As soon as possible'}</dd>
          <dt className="text-muted">Where</dt><dd>{r.addressText}</dd>
        </dl>
      </Section>
      <Section title="Activity">
        <ul className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-[15px]">
          {r.history.map((h: any, i: number) => (<li key={i} className="contents"><span className="text-muted">{time(h.at)}</span><span>{h.note ?? h.to}</span></li>))}
        </ul>
      </Section>
    </>
  );
}
