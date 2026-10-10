'use client';

import { BOOKING_TYPE_LABEL, PRICING_LABEL } from '@karvia/shared';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PublicPage } from '@/components/shells';
import { ErrorBox, Icon, Loading, Pill } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Categories() {
  const { data, error, loading, reload } = useApi<any[]>('/catalog');
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const cat = useMemo(() => data?.find((c) => c.id === active) ?? data?.[0], [data, active]);
  const matches = useMemo(() => {
    if (!q.trim() || !data) return null;
    const t = q.toLowerCase();
    return data.flatMap((c) => c.subCategories.flatMap((s: any) => s.services.filter((v: any) => `${v.name} ${s.name} ${c.name} ${v.nameHi ?? ''}`.toLowerCase().includes(t)).map((v: any) => ({ ...v, sub: s.name }))));
  }, [q, data]);

  const ServiceCard = ({ v }: { v: any }) => (
    <div className="card flex flex-col gap-2 p-4">
      <b className="text-lg">{v.name}</b>
      <div className="flex flex-wrap gap-1.5">
        {v.bookingTypes.map((b: string) => <Pill key={b} tone={b === 'QUOTE' ? 'amber' : b === 'INSTANT' ? 'green' : 'blue'}>{BOOKING_TYPE_LABEL[b]}</Pill>)}
      </div>
      <span className="text-sm text-muted">{v.pricingModels.map((m: string) => PRICING_LABEL[m]).join(' · ')}</span>
      <Link href={`/login?as=client&next=${encodeURIComponent(`/client/find?service=${v.id}`)}`} className="mt-1 font-semibold text-brand">See workers →</Link>
    </div>
  );

  return (
    <PublicPage>
      <section className="bg-canvas">
        <div className="container-page flex flex-col gap-4 py-12">
          <h1 className="text-5xl font-extrabold">All categories</h1>
          <p className="text-lg text-slate">Category → Sub-category → Service. Each service shows how workers price it.</p>
          <label htmlFor="cs" className="sr-only">Search services</label>
          <input id="cs" className="input max-w-xl" placeholder="Search: electrician, driver, painter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </section>
      <section className="container-page py-10">
        {loading && <Loading />}
        {error && <ErrorBox message={error.message} onRetry={reload} />}
        {matches && (
          <div className="flex flex-col gap-3">
            <p className="text-muted">{matches.length} service{matches.length === 1 ? '' : 's'} match “{q}”</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">{matches.map((v) => <ServiceCard key={v.id} v={v} />)}</div>
          </div>
        )}
        {data && !matches && (
          <div className="flex flex-wrap items-start gap-7">
            <nav className="flex w-full flex-col gap-1 sm:w-64" aria-label="Categories">
              <span className="eyebrow px-3 pb-2">Categories</span>
              {data.map((c) => (
                <button key={c.id} onClick={() => setActive(c.id)} className={`rounded-xl px-3 py-2.5 text-left ${cat?.id === c.id ? 'bg-brand-tint font-semibold text-brand' : 'text-ink hover:bg-canvas'}`}>{c.name}</button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-7">
              {cat?.subCategories.map((s: any) => (
                <div key={s.id} className="flex flex-col gap-3">
                  <h2 className="text-2xl font-bold">{s.name} {s.nameHi && <span className="text-lg font-medium text-muted">· {s.nameHi}</span>}</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">{s.services.map((v: any) => <ServiceCard key={v.id} v={v} />)}</div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-gold-tint p-4">
                {Icon.lock('#8A5A00')}
                <p className="flex-1">Worker profiles, prices and contact details are visible after the <b>₹9 / 30-day</b> access payment.</p>
                <Link href="/login?as=client" className="rounded-xl bg-ink px-4 py-3 font-semibold text-white no-underline">Unlock access</Link>
              </div>
            </div>
          </div>
        )}
      </section>
    </PublicPage>
  );
}
