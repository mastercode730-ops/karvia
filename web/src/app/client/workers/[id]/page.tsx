'use client';

import { date, PRICING_LABEL, rupees } from '@karvia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ClientShell } from '@/components/shells';
import { Avatar, Button, ErrorBox, Icon, Loading, Pill, Section, Stars } from '@/components/ui';
import { api, useApi } from '@/lib/session';

export default function WorkerProfile() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const me = useApi<any>('/me/client');
  const at = me.data?.addresses?.find((a: any) => a.isDefault) ?? me.data?.profile;
  const { data: w, error, loading, reload, setData } = useApi<any>(me.data ? `/workers/${id}${at?.lat ? `?lat=${at.lat}&lng=${at.lng}` : ''}` : null, [me.data]);
  const [busy, setBusy] = useState(false);

  if (loading || me.loading) return <Loading />;
  if (error?.code === 'ACCESS_REQUIRED')
    return (
      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-gold-tint p-5">{Icon.lock('#8A5A00')}<p className="flex-1">{error.message}</p><Link href="/client/access" className="rounded-xl bg-ink px-4 py-3 font-semibold text-white no-underline">Unlock access</Link></div>
    );
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!w) return null;

  const toggle = async (kind: 'FAVOURITE' | 'FOLLOW') => {
    setBusy(true);
    const on = kind === 'FAVOURITE' ? w.favourite : w.following;
    await (on ? api.del(`/favourites/${w.id}?kind=${kind}`) : api.post(`/favourites/${w.id}`, { kind }));
    setData({ ...w, [kind === 'FAVOURITE' ? 'favourite' : 'following']: !on });
    setBusy(false);
  };
  const serviceId = w.services[0]?.id;
  const priced = w.rates.filter((r: any) => r.amountPaise != null).sort((a: any, b: any) => a.amountPaise - b.amountPaise)[0];

  return (
    <>
      <Link href="/client/find" className="font-semibold">← Back to results</Link>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <section className="card flex flex-wrap items-center gap-5 p-6">
            <Avatar name={w.name} url={api.fileUrl(w.photoUrl)} size={112} />
            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-extrabold">{w.name}</h1><Pill tone="green">✓ Verified by Karvia</Pill></div>
              <p className="text-lg text-slate">{w.services.map((s: any) => s.subCategory).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(', ')} · {w.services.map((s: any) => s.name).join(', ')}</p>
              <p className="text-muted">{w.area}{w.distanceKm != null ? ` · ${w.distanceKm} KM from your job` : ''}{w.languages.length ? ` · ${w.languages.join(', ')}` : ''}</p>
              <div className="flex flex-wrap gap-2"><Pill status={w.availability}>{w.availability === 'AVAILABLE' ? '● Available now' : 'Busy right now'}</Pill><Pill tone="grey">Advance booking: {w.advanceBooking ? 'Yes' : 'No'}</Pill></div>
            </div>
            <dl className="grid flex-[1_1_260px] grid-cols-3 overflow-hidden rounded-xl border border-line text-center">
              <div className="p-3"><dd className="font-display text-2xl font-extrabold">{w.ratingCount ? w.ratingAvg : 'New'}</dd><dt className="text-[13px] text-muted">{w.ratingCount} reviews</dt></div>
              <div className="border-x border-line p-3"><dd className="font-display text-2xl font-extrabold">{w.jobsDone}</dd><dt className="text-[13px] text-muted">jobs done</dt></div>
              <div className="p-3"><dd className="font-display text-2xl font-extrabold">{w.experienceYears ?? 0} yrs</dd><dt className="text-[13px] text-muted">experience</dt></div>
            </dl>
          </section>

          <Section title="Services & prices">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse">
                <thead><tr className="text-left text-sm text-muted"><th className="border-b border-line p-2.5">Service</th><th className="border-b border-line p-2.5">Pricing</th><th className="border-b border-line p-2.5 text-right">Rate</th></tr></thead>
                <tbody>
                  {w.rates.map((r: any) => (
                    <tr key={r.id}><td className="border-b border-line p-2.5">{r.label}</td><td className="border-b border-line p-2.5 text-muted">{PRICING_LABEL[r.model]}</td><td className="border-b border-line p-2.5 text-right font-semibold">{r.amountPaise != null ? rupees(r.amountPaise) : 'Request quote'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">The price shown at confirmation is locked for your booking, even if the worker changes rates later. Material is extra and shown separately.</p>
          </Section>

          {(w.skills.length > 0 || w.workPhotos.length > 0) && (
            <Section title="Skills & work photos">
              <div className="flex flex-wrap gap-2">{[...w.skills, ...w.certifications].map((s: string) => <span key={s} className="rounded-full bg-canvas px-3 py-1.5">{s}</span>)}</div>
              {w.workPhotos.length > 0 && <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">{w.workPhotos.map((p: any) => <img key={p.id} src={api.fileUrl(p.url)} alt="Work sample" className="aspect-square w-full rounded-xl object-cover" />)}</div>}
            </Section>
          )}

          {w.employment.length > 0 && (
            <Section title="Work history">
              {w.employment.map((e: any) => (
                <div key={e.id} className="flex gap-3.5 border-b border-line py-3 last:border-0"><span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" /><div><b>{e.title} · {e.company}</b><p className="text-sm text-muted">{[e.startDate, e.endDate].filter(Boolean).join(' – ')}{e.responsibilities ? ` · ${e.responsibilities}` : ''}</p></div></div>
              ))}
            </Section>
          )}

          <Section title="Reviews" action={<span className="text-sm text-muted">From completed bookings only</span>}>
            {w.reviews.length === 0 && <p className="text-muted">No reviews yet.</p>}
            {w.reviews.map((r: any) => (
              <div key={r.id} className="border-b border-line py-3 last:border-0">
                <div className="flex justify-between"><b>{r.author}</b><Stars value={r.stars} /></div>
                {r.text && <p className="mt-1 text-slate">{r.text}</p>}
                <span className="text-[13px] text-muted">{date(r.createdAt)}</span>
              </div>
            ))}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <section className="card flex flex-col gap-3 p-6">
            <span className="text-muted">Starts at</span>
            <b className="font-display text-4xl font-extrabold leading-none">{priced ? rupees(priced.amountPaise) : 'Quote'} {priced && <span className="font-sans text-base font-medium text-muted">{PRICING_LABEL[priced.model].toLowerCase()}</span>}</b>
            <Link href={`/client/new-request?service=${serviceId}&worker=${w.id}`} className="rounded-xl bg-brand py-3.5 text-center font-bold text-white no-underline">Book now</Link>
            <Link href={`/client/new-request?service=${serviceId}&worker=${w.id}&type=QUOTE`} className="rounded-xl border border-line-strong py-3.5 text-center font-semibold text-ink no-underline">Request a quote</Link>
            <Button variant="secondary" onClick={() => toggle('FAVOURITE')} loading={busy}>{w.favourite ? '♥ In My workers' : '♡ Add to My workers'}</Button>
            <Button variant="ghost" onClick={() => toggle('FOLLOW')} disabled={busy}>{w.following ? 'Following' : 'Follow'}</Button>
          </section>
          <div className="flex items-start gap-2.5 rounded-2xl bg-gold-tint p-4">{Icon.lock('#8A5A00')}<p className="text-[15px] leading-relaxed">Phone number opens after {w.name?.split(' ')[0]} accepts your request.</p></div>
          <section className="card flex flex-col gap-1.5 p-4"><b>Availability</b><p className="text-sm text-slate">Minimum notice {Math.round(w.minNoticeMin / 60)} h · Books up to {w.maxAdvanceDays} days ahead</p></section>
          <Link href={`/client/report?against=${w.id}`} className="px-1 text-sm font-semibold text-alert-text">Report this profile</Link>
        </aside>
      </div>
    </>
  );
}
