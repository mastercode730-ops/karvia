'use client';

import { PRICING_LABEL, rupees } from '@karvia/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ServiceSelect } from '@/components/service-select';
import { ClientShell } from '@/components/shells';
import { Avatar, Button, Empty, ErrorBox, Icon, Loading, Pill } from '@/components/ui';
import { api, errMsg, useApi } from '@/lib/session';

export default function Find() {
  return (
    <ClientShell>
      <Suspense><FindInner /></Suspense>
    </ClientShell>
  );
}

function FindInner() {
  const params = useSearchParams();
  const router = useRouter();
  const me = useApi<any>('/me/client');
  const [serviceId, setServiceId] = useState(params.get('service') ?? '');
  const [radius, setRadius] = useState(5);
  const [sort, setSort] = useState('nearest');
  const [availableNow, setAvailableNow] = useState(true);
  const [addressId, setAddressId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(new Set());

  const addresses = me.data?.addresses ?? [];
  const where = useMemo(() => {
    const a = addresses.find((x: any) => x.id === addressId) ?? addresses.find((x: any) => x.isDefault) ?? null;
    if (a) return { lat: a.lat, lng: a.lng, label: a.label + ' · ' + (a.area ?? a.line) };
    const p = me.data?.profile;
    return p?.lat ? { lat: p.lat, lng: p.lng, label: p.area } : null;
  }, [addresses, addressId, me.data]);

  useEffect(() => {
    api.get('/favourites').then((r) => setFavs(new Set(r.favourites.map((w: any) => w.id)))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!serviceId || !where) return;
    setLoading(true);
    setError(null);
    api
      .get(`/workers/search?serviceId=${serviceId}&lat=${where.lat}&lng=${where.lng}&radiusKm=${radius}&sort=${sort}&availableNow=${availableNow}`)
      .then(setResult)
      .catch((e) => setError({ message: errMsg(e), code: e.code }))
      .finally(() => setLoading(false));
  }, [serviceId, where, radius, sort, availableNow]);

  const toggleFav = async (id: string) => {
    const on = favs.has(id);
    await (on ? api.del(`/favourites/${id}?kind=FAVOURITE`) : api.post(`/favourites/${id}`, { kind: 'FAVOURITE' }));
    const n = new Set(favs);
    on ? n.delete(id) : n.add(id);
    setFavs(n);
  };

  if (me.loading) return <Loading />;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-extrabold">Find a worker</h1>
        {serviceId && <Link href={`/client/new-request?service=${serviceId}`} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white no-underline">Send request to all nearby</Link>}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <aside className="card flex w-full flex-col gap-4 p-5 lg:w-72">
          <div className="flex flex-col gap-1.5"><label htmlFor="svc" className="label">Service</label><ServiceSelect value={serviceId} onChange={(id) => { setServiceId(id); router.replace(`/client/find?service=${id}`); }} /></div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="addr" className="label">Job location</label>
            <select id="addr" className="input" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.map((a: any) => <option key={a.id} value={a.id}>{a.label} · {a.area ?? a.line}</option>)}
              {!addresses.length && <option value="">{where?.label ?? 'Set location in profile'}</option>}
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><label htmlFor="rad" className="label">Distance</label>
            <select id="rad" className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[5, 10, 15, 20].map((r) => <option key={r} value={r}>Within {r} KM</option>)}</select>
          </div>
          <div className="flex flex-col gap-1.5"><label htmlFor="sort" className="label">Sort by</label>
            <select id="sort" className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="nearest">Nearest first</option><option value="rating">Rating</option><option value="price">Price: low to high</option><option value="jobs">Most jobs done</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5" checked={availableNow} onChange={(e) => setAvailableNow(e.target.checked)} /> Available now only</label>
        </aside>

        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          {!serviceId && <Empty title="Choose a service to see workers near you" body="Workers are matched to your job location, never shown with their home address." />}
          {loading && <Loading label="Finding workers near you…" />}
          {error?.code === 'ACCESS_REQUIRED' && (
            <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-gold-tint p-5">
              {Icon.lock('#8A5A00')}<p className="flex-1">{error.message}</p>
              <Link href="/client/access" className="rounded-xl bg-ink px-4 py-3 font-semibold text-white no-underline">Unlock access</Link>
            </div>
          )}
          {error && error.code !== 'ACCESS_REQUIRED' && <ErrorBox message={error.message} />}
          {result && !loading && (
            <>
              <p className="text-muted"><b className="text-ink">{result.items.length} verified worker{result.items.length === 1 ? '' : 's'}</b> within {result.radiusKm} KM of your job</p>
              {result.items.length === 0 && (
                <Empty title={`No verified worker is free within ${result.radiusKm} KM right now`} body="Search a wider area, or send your request and we will notify you when someone accepts."
                  action={<div className="flex flex-wrap gap-2">{result.nextRadiusKm && <Button variant="secondary" onClick={() => setRadius(result.nextRadiusKm)}>Search {result.nextRadiusKm} KM</Button>}<Link href={`/client/new-request?service=${serviceId}`} className="rounded-xl bg-ink px-4 py-3 font-semibold text-white no-underline">Send request anyway</Link></div>} />
              )}
              {result.items.map((w: any) => (
                <div key={w.id} className="card flex flex-wrap items-center gap-4 p-5">
                  <Avatar name={w.name} url={api.fileUrl(w.photoUrl)} size={64} />
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2"><Link href={`/client/workers/${w.id}`} className="font-display text-xl font-bold text-ink no-underline">{w.name}</Link><Pill tone="green">✓ Verified</Pill><Pill status={w.availability} /></div>
                    <p className="text-sm text-muted">{w.experienceYears ?? 0} yrs exp · {w.jobsDone} jobs done · {w.distanceKm} KM away{w.languages.length ? ` · ${w.languages.join(', ')}` : ''}</p>
                    {w.skills.length > 0 && <p className="text-sm text-slate">{w.skills.join(' · ')}</p>}
                  </div>
                  <div className="flex min-w-[120px] flex-col items-end gap-0.5">
                    <b className="font-display text-2xl font-extrabold">{w.startingPrice ? rupees(w.startingPrice.amountPaise) : 'Quote'}</b>
                    <span className="text-[13px] text-muted">{w.startingPrice ? PRICING_LABEL[w.startingPrice.model].toLowerCase() : 'on request'}</span>
                    <span className="text-sm font-semibold">{w.ratingCount ? `★ ${w.ratingAvg} (${w.ratingCount})` : 'New'}</span>
                  </div>
                  <div className="flex basis-full flex-wrap justify-end gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="secondary" onClick={() => toggleFav(w.id)} aria-pressed={favs.has(w.id)}>{favs.has(w.id) ? '♥ Saved' : '♡ Favourite'}</Button>
                    <Link href={`/client/workers/${w.id}`} className="rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-ink no-underline">View profile</Link>
                    <Link href={`/client/new-request?service=${serviceId}&worker=${w.id}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white no-underline">Request this worker</Link>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </>
  );
}
