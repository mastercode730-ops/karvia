'use client';

import { ago, COMPLAINT_LABEL, date, rupees } from '@karvia/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errMsg, useApi, useLive } from '@/lib/session';
import { Button, Empty, ErrorBox, Field, Loading, Pill, Section, useToast } from './ui';
import { FileButton } from './widgets';

const TONE_DOT: Record<string, string> = {
  WORKER_ACCEPTED: 'bg-brand', BOOKING_CONFIRMED: 'bg-brand', JOB_COMPLETED: 'bg-brand', PAYMENT_SUCCESS: 'bg-brand', WORKER_VERIFIED: 'bg-brand',
  NEW_REQUEST: 'bg-gold', NO_WORKER: 'bg-muted', REQUEST_EXPIRED: 'bg-muted', TRIAL_ENDING: 'bg-gold', ACCESS_ENDING: 'bg-gold', PLAN_ENDING: 'bg-gold',
  PAYMENT_FAILED: 'bg-alert', BOOKING_CANCELLED: 'bg-alert', WORKER_CANCELLED: 'bg-alert', WARNING: 'bg-alert', DOCUMENT_REJECTED: 'bg-alert',
};

/** Links in notifications are app paths; map them to this app's routes. */
const linkFor = (l: string | null) => (l && l.startsWith('/') && !l.startsWith('//') ? l : '#');

export function NotificationsList() {
  const { data, error, loading, reload } = useApi<any>('/notifications');
  useLive(['notification'], reload);
  const readAll = async () => {
    await api.post('/notifications/read-all');
    reload();
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2.5"><h1 className="text-4xl font-extrabold">Notifications</h1>{data?.unread > 0 && <Button variant="ghost" onClick={readAll}>Mark all as read</Button>}</div>
      {loading && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data?.items.length === 0 && <Empty title="No notifications yet" />}
      {data?.items.length > 0 && (
        <ul className="card overflow-hidden">
          {data.items.map((n: any) => (
            <li key={n.id}>
              <Link href={linkFor(n.link)} onClick={() => !n.readAt && api.post(`/notifications/${n.id}/read`)} className={`flex items-start gap-3.5 border-b border-line px-5 py-4 text-ink no-underline last:border-0 ${n.readAt ? 'bg-white' : 'bg-[#F3FAF7]'}`}>
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[n.type] ?? 'bg-info'}`} />
                <span className="min-w-0 flex-1"><b>{n.title}</b><span className="mt-0.5 block text-sm text-slate">{n.body}</span></span>
                <span className="whitespace-nowrap text-[13px] text-muted">{ago(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">Booking and payment updates always arrive. Offers can be turned off in your profile. Email is sent only if you added one.</p>
    </div>
  );
}

export function ReportForm({ role }: { role: 'CLIENT' | 'WORKER' }) {
  const p = useSearchParams();
  const toast = useToast();
  const bookings = useApi<any>('/bookings?tab=all');
  const mine = useApi<any[]>('/complaints');
  const [bookingId, setBookingId] = useState(p.get('booking') ?? '');
  const [reason, setReason] = useState(role === 'CLIENT' ? 'WORKER_DID_NOT_ARRIVE' : 'CLIENT_DID_NOT_PAY');
  const [amount, setAmount] = useState('');
  const [paidVia, setPaidVia] = useState('UPI');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasons = Object.keys(COMPLAINT_LABEL).filter((r) => (role === 'CLIENT' ? r !== 'CLIENT_DID_NOT_PAY' : !['WORKER_DID_NOT_ARRIVE', 'OVERCHARGING', 'MISLEADING_PRICE', 'POOR_SERVICE'].includes(r)));

  useEffect(() => {
    if (!bookingId && bookings.data?.items[0]) setBookingId(bookings.data.items[0].id);
  }, [bookings.data, bookingId]);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await api.post('/complaints', {
        bookingId: bookingId || undefined, againstId: p.get('against') ?? undefined, reason, description, paidVia,
        amountPaise: amount ? Math.round(Number(amount) * 100) : undefined, evidenceFileIds: files.map((f) => f.id),
      });
      toast.show(`Report #C-${c.number} submitted`);
      setDescription('');
      setFiles([]);
      mine.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-5">
      {toast.node}
      <form className="card flex min-w-0 flex-[999_1_600px] flex-col gap-4 p-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div><h1 className="text-3xl font-extrabold">Report a problem</h1><p className="mt-1 text-muted">Our team reviews every report. Add as much evidence as you can.</p></div>
        <Field label="Booking" htmlFor="bk">
          <select id="bk" className="input" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
            <option value="">Not about a booking</option>
            {bookings.data?.items.map((b: any) => <option key={b.id} value={b.id}>{b.code} · {b.service} · {b.otherParty ?? ''}</option>)}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-2">What went wrong?</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
            {reasons.map((r) => (
              <label key={r} className={`flex cursor-pointer gap-2 rounded-xl p-3 ${reason === r ? 'border-2 border-alert bg-alert-tint' : 'border border-line-strong'}`}>
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {COMPLAINT_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1"><Field label="Amount paid (if any, ₹)" htmlFor="amt"><input id="amt" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></Field></div>
          <div className="flex-1"><Field label="Paid by" htmlFor="pv"><select id="pv" className="input" value={paidVia} onChange={(e) => setPaidVia(e.target.value)}>{['UPI', 'CASH', 'CARD', 'BANK', 'OTHER'].map((v) => <option key={v}>{v}</option>)}</select></Field></div>
        </div>
        <Field label="Describe what happened" htmlFor="ds"><textarea id="ds" rows={4} className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="flex flex-col gap-2">
          <span className="label">Evidence (photos, payment screenshot, PDF, video)</span>
          <FileButton kind="EVIDENCE" accept="image/*,application/pdf,video/mp4" label="Add evidence" onUploaded={(f) => setFiles((x) => [...x, f])} />
          <div className="flex flex-wrap gap-2">{files.map((f) => <span key={f.id} className="rounded-lg bg-canvas px-3 py-1.5 text-sm">{f.name ?? 'file'} <button type="button" aria-label="Remove" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>✕</button></span>)}</div>
        </div>
        {error && <ErrorBox message={error} />}
        <Button type="submit" className="self-start !bg-alert" loading={busy} disabled={description.trim().length < 10}>Submit report</Button>
      </form>
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
        <Section title="My reports">
          {mine.data?.length === 0 && <p className="text-sm text-muted">No reports yet.</p>}
          {mine.data?.map((c) => (
            <div key={c.id} className="border-b border-line py-2.5 last:border-0">
              <div className="flex justify-between gap-2"><b>#C-{c.number} · {COMPLAINT_LABEL[c.reason]}</b><Pill status={c.status} /></div>
              <p className="text-sm text-muted">Opened {date(c.createdAt)}{c.resolution ? ` · ${c.resolution}` : ''}</p>
            </div>
          ))}
        </Section>
        {role === 'CLIENT' && <div className="rounded-2xl bg-gold-tint p-4 text-[15px] leading-relaxed">Because you paid the worker directly, Karvia can’t promise an automatic refund. We can warn, suspend or block the worker and help with evidence.</div>}
      </aside>
    </div>
  );
}

export function PaymentsHistory() {
  const { data } = useApi<any[]>('/payments/mine');
  if (!data) return <Loading />;
  if (!data.length) return <p className="text-muted">No payments yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[15px]">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-muted">{['Date', 'Description', 'Transaction ID', 'Amount', 'Status'].map((h) => <th key={h} className="border-b border-line px-3 py-2.5">{h}</th>)}</tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.id}>
              <td className="border-b border-line px-3 py-3">{date(p.createdAt)}</td>
              <td className="border-b border-line px-3 py-3">{p.purpose === 'CLIENT_ACCESS' ? 'Client access · 30 days' : 'Worker plan · 30 days'}</td>
              <td className="border-b border-line px-3 py-3 text-muted">{(p.providerPaymentId ?? p.providerOrderId).slice(0, 14)}…</td>
              <td className="border-b border-line px-3 py-3 font-semibold">{rupees(p.totalPaise)}</td>
              <td className="border-b border-line px-3 py-3"><Pill status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
