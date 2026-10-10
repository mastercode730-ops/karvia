'use client';

import { rupees } from '@karvia/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { BookingsList } from '@/components/bookings-list';
import { WorkerShell } from '@/components/shells';
import { Button, Countdown, ErrorBox, Field, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useLive } from '@/lib/session';

export default function Jobs() {
  return (
    <WorkerShell>
      <Suspense><Inner /></Suspense>
    </WorkerShell>
  );
}

function QuoteForm({ offer, onDone }: { offer: any; onDone: () => void }) {
  const [service, setService] = useState('');
  const [material, setMaterial] = useState('');
  const [tax, setTax] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = (s: string) => Math.round(Number(s || 0) * 100);
  const total = p(service) + p(material) + p(tax);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await api.post(`/worker/offers/${offer.requestId}/quote`, { servicePaise: p(service), materialPaise: p(material), taxPaise: p(tax), note: note || undefined });
        onDone();
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setBusy(false);
      }
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Service charge (₹)" htmlFor={`s${offer.offerId}`}><input id={`s${offer.offerId}`} inputMode="decimal" className="input" value={service} onChange={(e) => setService(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <Field label="Material / extra (₹)" htmlFor={`m${offer.offerId}`}><input id={`m${offer.offerId}`} inputMode="decimal" className="input" value={material} onChange={(e) => setMaterial(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
        <Field label="Tax, if applicable (₹)" htmlFor={`t${offer.offerId}`}><input id={`t${offer.offerId}`} inputMode="decimal" className="input" value={tax} onChange={(e) => setTax(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
      </div>
      <Field label="Note to client" htmlFor={`n${offer.offerId}`}><textarea id={`n${offer.offerId}`} rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is included, how long it takes" /></Field>
      <div className="flex justify-between rounded-xl bg-canvas p-3"><b>Total</b><b className="font-display text-xl">{rupees(total)}</b></div>
      <p className="text-[13px] text-muted">Valid for 30 minutes. You can withdraw before the client accepts. Sending again creates a new version.</p>
      {error && <ErrorBox message={error} />}
      <Button type="submit" loading={busy} disabled={p(service) < 100} className="self-start !bg-info">{offer.myQuote ? 'Send revised quote' : 'Submit quote'}</Button>
    </form>
  );
}

function Inner() {
  const params = useSearchParams();
  const offers = useApi<any[]>('/worker/offers');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [quoting, setQuoting] = useState<string | null>(params.get('quote'));
  useLive(['offer:new', 'offer:closed'], () => offers.reload());

  const respond = async (requestId: string, action: 'accept' | 'reject') => {
    setBusy(requestId + action);
    try {
      const r = await api.post(`/worker/offers/${requestId}/${action}`);
      if (action === 'accept') location.assign(`/worker/jobs/${r.bookingId}`);
      else toast.show('Request skipped. It stays open for other workers.');
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(null);
      offers.reload();
    }
  };
  const recent = offers.data ?? [];

  return (
    <>
      {toast.node}
      <h1 className="text-4xl font-extrabold">Requests & jobs</h1>
      <Section title="New requests">
        {recent.length === 0 && <p className="text-muted">No requests right now. Make sure you are AVAILABLE.</p>}
        {recent.map((o) => (
          <div key={o.offerId} className={`flex flex-col gap-3 rounded-2xl p-4 ${o.state === 'OPEN' ? (o.bookingType === 'QUOTE' ? 'border-2 border-info' : 'border-2 border-gold') : 'border border-line bg-canvas opacity-80'}`}>
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-0 flex-[1_1_300px]">
                <span className={`text-xs font-bold ${o.bookingType === 'QUOTE' ? 'text-info' : 'text-gold-text'}`}>{o.bookingType}{o.state === 'OPEN' && o.bookingType !== 'QUOTE' && <> · <Countdown to={o.expiresAt} onDone={() => offers.reload()} /> left</>}</span>
                <h2 className="text-xl font-bold">{o.service} · {o.area}</h2>
                <p className="text-sm text-muted">{o.distanceKm} KM · {o.when} · “{o.description}”</p>
              </div>
              {o.state === 'OPEN' && o.bookingType !== 'QUOTE' && (
                <div className="flex gap-2"><Button variant="secondary" disabled={!!busy} onClick={() => respond(o.requestId, 'reject')}>Reject</Button><Button loading={busy === o.requestId + 'accept'} onClick={() => respond(o.requestId, 'accept')}>Accept</Button></div>
              )}
              {o.state === 'OPEN' && o.bookingType === 'QUOTE' && (
                <Button variant="dark" onClick={() => setQuoting(quoting === o.requestId ? null : o.requestId)}>{o.myQuote ? `Your quote ${rupees(o.myQuote.totalPaise)} · revise` : 'Send quote'}</Button>
              )}
              {o.state === 'TAKEN' && <Pill tone="grey">Request already assigned</Pill>}
              {['EXPIRED', 'CLOSED', 'REJECTED'].includes(o.state) && <Pill tone="grey">{o.state === 'REJECTED' ? 'You declined' : 'Closed'}</Pill>}
              {o.state === 'ACCEPTED' && <Pill tone="green">Yours</Pill>}
            </div>
            {o.myQuote && <p className="text-sm">Quote v{o.myQuote.version} · <Pill status={o.myQuote.status} /> {o.myQuote.status === 'ACTIVE' && <button className="ml-2 text-sm font-semibold text-alert-text" onClick={async () => { await api.post(`/worker/offers/quotes/${o.myQuote.id}/withdraw`); offers.reload(); }}>Withdraw</button>}</p>}
            {quoting === o.requestId && o.state === 'OPEN' && <QuoteForm offer={o} onDone={() => { setQuoting(null); toast.show('Quote sent'); offers.reload(); }} />}
          </div>
        ))}
      </Section>
      <BookingsList base="/worker/jobs" title="My jobs" />
    </>
  );
}
