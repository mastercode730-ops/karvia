'use client';

import { dateTime, PRICING_LABEL, rupees, time } from '@karvia/shared';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { api, errMsg, useApi, useLive } from '@/lib/session';
import { Avatar, Button, ErrorBox, Field, Icon, Loading, Pill, Section, StarInput, Stars, useToast } from './ui';

/** Booking detail for both sides. Every action is re-checked by the server; buttons only reflect what is allowed. */
export function BookingView({ id, role }: { id: string; role: 'CLIENT' | 'WORKER' }) {
  const { data: b, error, loading, reload } = useApi<any>(`/bookings/${id}`);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [charge, setCharge] = useState({ label: '', amount: '', kind: 'MATERIAL' });
  useLive(['booking:update'], (p) => p?.id === id && reload());

  if (loading && !b) return <Loading />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!b) return null;

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.show(ok);
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(null);
    }
  };
  const other = role === 'CLIENT' ? b.worker : b.client;
  const price = b.agreedPrice;
  const approvedCharges = b.charges.filter((c: any) => c.approvedAt);
  const pending = b.charges.filter((c: any) => !c.approvedAt && !c.rejectedAt);
  const back = role === 'CLIENT' ? '/client/bookings' : '/worker/jobs';

  return (
    <>
      {toast.node}
      <Link href={back} className="font-semibold">← {role === 'CLIENT' ? 'My bookings' : 'Requests & jobs'}</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-muted">Booking {b.code}</p><h1 className="text-4xl font-extrabold">{b.service.name}</h1></div>
        <Pill status={b.status} />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <section className="card flex flex-wrap items-center gap-4 p-5">
            <Avatar name={other.name} url={role === 'CLIENT' ? api.fileUrl(b.worker.photoUrl) : null} size={60} />
            <div className="flex-[1_1_200px]">
              {role === 'CLIENT' ? <Link href={`/client/workers/${b.worker.id}`} className="font-display text-xl font-bold text-ink no-underline">{b.worker.name}</Link> : <b className="font-display text-xl">{b.client.name ?? 'Client'}</b>}
              <p className="text-sm text-muted">{role === 'CLIENT' ? `★ ${b.worker.ratingAvg || 'New'} · ${b.worker.jobsDone} jobs · Verified` : 'Karvia client'}</p>
            </div>
            {other.phone ? (
              <a href={`tel:+91${other.phone}`} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-white no-underline">{Icon.phone('#fff')} +91 {other.phone}</a>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted">{Icon.lock()} Contact opens after acceptance</span>
            )}
          </section>

          {role === 'CLIENT' && b.status === 'ACCEPTED' && (
            <Section className="!border-2 !border-brand" title="Confirm your booking">
              <p className="text-slate">{b.worker.name} accepted. Confirm to lock the booking at the price below.</p>
              <div className="flex flex-wrap gap-2">
                <Button loading={busy === 'confirm'} onClick={() => run('confirm', () => api.post(`/bookings/${id}/confirm`), 'Booking confirmed')}>Confirm booking</Button>
                <Button variant="secondary" onClick={() => setCancelOpen(true)}>Decline</Button>
              </div>
            </Section>
          )}
          {role === 'WORKER' && b.status === 'CONFIRMED' && (
            <Section title="Ready to start?"><Button loading={busy === 'start'} onClick={() => run('start', () => api.post(`/bookings/${id}/start`), 'Job started')}>Start job</Button></Section>
          )}
          {role === 'WORKER' && b.status === 'IN_PROGRESS' && (
            <Section title="Job in progress">
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run('charge', () => api.post(`/bookings/${id}/charges`, { label: charge.label, kind: charge.kind, amountPaise: Math.round(Number(charge.amount) * 100) }), 'Sent to client for approval').then(() => setCharge({ label: '', amount: '', kind: 'MATERIAL' })); }}>
                <Field label="Extra charge" htmlFor="cl"><input id="cl" className="input" placeholder="e.g. New tap" value={charge.label} onChange={(e) => setCharge({ ...charge, label: e.target.value })} /></Field>
                <Field label="Type" htmlFor="ck"><select id="ck" className="input" value={charge.kind} onChange={(e) => setCharge({ ...charge, kind: e.target.value })}><option value="MATERIAL">Material</option><option value="EXTRA">Extra work</option></select></Field>
                <Field label="Amount (₹)" htmlFor="ca"><input id="ca" inputMode="decimal" className="input w-28" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
                <Button type="submit" variant="secondary" loading={busy === 'charge'} disabled={charge.label.length < 2 || !Number(charge.amount)}>Ask client</Button>
              </form>
              <Button loading={busy === 'complete'} onClick={() => run('complete', () => api.post(`/bookings/${id}/complete`), 'Job completed')}>Mark complete</Button>
            </Section>
          )}
          {role === 'CLIENT' && pending.map((c: any) => (
            <Section key={c.id} className="!border-gold-line" title="Extra charge needs your approval">
              <p>{c.label} ({c.kind.toLowerCase()}): <b>{rupees(c.amountPaise)}</b></p>
              <div className="flex gap-2">
                <Button loading={busy === c.id} onClick={() => run(c.id, () => api.post(`/bookings/${id}/charges/${c.id}/answer`, { approve: true }), 'Approved')}>Approve</Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => run(`x${c.id}`, () => api.post(`/bookings/${id}/charges/${c.id}/answer`, { approve: false }), 'Declined')}>Decline</Button>
              </div>
            </Section>
          ))}

          <Section title="Agreed price" action={<span className="text-[13px] font-semibold text-brand">🔒 Locked at confirmation</span>}>
            {price.kind === 'QUOTE' ? (
              <dl className="grid grid-cols-[1fr_auto] gap-2">
                <dt>Service charge</dt><dd>{rupees(price.servicePaise)}</dd>
                <dt>Material / extra</dt><dd>{rupees(price.materialPaise)}</dd>
                {price.taxPaise > 0 && (<><dt>Tax</dt><dd>{rupees(price.taxPaise)}</dd></>)}
                <dt className="border-t border-line pt-2 font-bold">Quoted total</dt><dd className="border-t border-line pt-2 font-bold">{rupees(price.totalPaise)}</dd>
              </dl>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-2">
                {price.items.map((i: any, n: number) => (<Fragment key={n}><dt>{i.label} <span className="text-sm text-muted">· {PRICING_LABEL[i.model]}</span></dt><dd>{i.amountPaise != null ? rupees(i.amountPaise) : 'Quote'}</dd></Fragment>))}
              </dl>
            )}
            {approvedCharges.length > 0 && (
              <dl className="grid grid-cols-[1fr_auto] gap-2 border-t border-line pt-2 text-slate">
                {approvedCharges.map((c: any) => (<Fragment key={c.id}><dt>{c.label} ({c.kind.toLowerCase()}, approved)</dt><dd>{rupees(c.amountPaise)}</dd></Fragment>))}
              </dl>
            )}
            <p className="text-sm text-muted">{role === 'CLIENT' ? 'Pay the worker directly when the job is done. Keep a screenshot or receipt as proof.' : 'The client pays you directly. Karvia takes no commission.'}</p>
          </Section>

          {b.canReview && (
            <Section title={role === 'CLIENT' ? `How was ${b.worker.name?.split(' ')[0]}?` : 'Rate this client'}>
              <StarInput value={stars} onChange={setStars} />
              <Field label="Review (optional)" htmlFor="rv"><textarea id="rv" rows={3} className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
              <Button disabled={!stars} loading={busy === 'review'} onClick={() => run('review', () => api.post(`/bookings/${id}/review`, { stars, text: text || undefined }), 'Thanks for the review')}>Submit review</Button>
            </Section>
          )}
          {b.myReview && <Section title="Your review"><Stars value={b.myReview.stars} />{b.myReview.text && <p className="text-slate">{b.myReview.text}</p>}</Section>}

          <Section title="Status history">
            <ul className="flex flex-col gap-3">
              {[...b.history].reverse().map((h: any, i: number) => (
                <li key={i} className="flex gap-3.5"><span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${i === 0 ? 'bg-brand' : 'bg-line-strong'}`} /><div><b>{h.to.replace('_', ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}</b><p className="text-sm text-muted">{dateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</p></div></li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <Section title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[15px]">
              <dt className="text-muted">When</dt><dd>{b.scheduledAt ? dateTime(b.scheduledAt) : 'As soon as possible'}</dd>
              <dt className="text-muted">Type</dt><dd>{b.bookingType.toLowerCase()}</dd>
              <dt className="text-muted">Address</dt><dd>{b.addressText ?? 'Shared after acceptance'}</dd>
              <dt className="text-muted">Work</dt><dd>{b.description}</dd>
              {b.startedAt && (<><dt className="text-muted">Started</dt><dd>{time(b.startedAt)}</dd></>)}
            </dl>
          </Section>
          {['ACCEPTED', 'CONFIRMED'].includes(b.status) && (
            <Section title="Need to cancel?">
              {!cancelOpen ? (
                <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel booking</Button>
              ) : (
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run('cancel', () => api.post(`/bookings/${id}/cancel`, { reason }), 'Booking cancelled'); }}>
                  <Field label="Reason" htmlFor="cr"><input id="cr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <Button type="submit" variant="danger" loading={busy === 'cancel'} disabled={reason.trim().length < 3}>Confirm cancellation</Button>
                </form>
              )}
              <p className="text-[13px] text-muted">Late cancellations are recorded. {role === 'WORKER' ? 'Repeated cancellations lead to warnings.' : ''}</p>
            </Section>
          )}
          <Link href={`${role === 'CLIENT' ? '/client/report' : '/worker/report'}?booking=${b.id}`} className="rounded-xl bg-alert-tint px-4 py-3.5 font-semibold text-alert-text no-underline">Report a problem with this booking →</Link>
        </aside>
      </div>
    </>
  );
}
