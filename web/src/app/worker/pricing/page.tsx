'use client';

import { useState } from 'react';
import { WorkerShell } from '@/components/shells';
import { Button, Field, Loading, Section } from '@/components/ui';
import { RatesForm, ServicesForm } from '@/components/worker-forms';
import { api, useApi } from '@/lib/session';

export default function Pricing() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { data: w, loading, setData } = useApi<any>('/worker/me');
  const [date, setDate] = useState('');
  if (loading || !w) return <Loading />;
  const setDates = async (dates: string[]) => {
    await api.put('/worker/me/blocked-dates', { dates });
    setData(await api.get('/worker/me'));
  };
  return (
    <>
      <div><h1 className="text-4xl font-extrabold">My services & pricing</h1><p className="mt-1 text-muted">Changing a price affects new bookings only. Confirmed bookings keep the agreed price.</p></div>
      <Section title="Rate card"><RatesForm key={w.rates.length} w={w} onSaved={setData} /></Section>
      <div className="flex flex-wrap gap-4">
        <Section className="flex-[1_1_420px]" title="Blocked dates">
          <p className="text-sm text-muted">No weekly calendar needed. Your AVAILABLE / BUSY switch does the rest. Block days you know you can’t work.</p>
          <div className="flex flex-wrap gap-2">{w.blockedDates.map((d: string) => <span key={d} className="rounded-lg bg-canvas px-3 py-1.5 text-sm">{d} <button aria-label={`Unblock ${d}`} onClick={() => setDates(w.blockedDates.filter((x: string) => x !== d))}>✕</button></span>)}</div>
          <div className="flex items-end gap-2"><Field label="Block a date" htmlFor="bd"><input id="bd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Button variant="secondary" disabled={!date} onClick={() => { setDates([...w.blockedDates, date]); setDate(''); }}>Block</Button></div>
        </Section>
        <Section className="flex-[1_1_420px]" title="Services & work area"><ServicesForm w={w} onSaved={setData} /></Section>
      </div>
      <section className="rounded-2xl bg-ink p-6 text-white">
        <b className="text-[13px] tracking-wide text-gold">EXAMPLE · DRIVER RATE CARD</b>
        <p className="mt-2 text-[#E6EBF2]">Hourly ₹150 · 8 hours ₹1,000 · Full day ₹1,200 · Extra hour ₹150 · Outstation: quote</p>
        <p className="mt-2">Client books 10 hours → <b className="text-gold">₹1,000 + 2 × ₹150 = ₹1,300</b></p>
      </section>
    </>
  );
}
