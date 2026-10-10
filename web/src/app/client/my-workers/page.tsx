'use client';

import { date } from '@karvia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { ClientShell } from '@/components/shells';
import { Avatar, Empty, Loading, Pill } from '@/components/ui';
import { api, useApi } from '@/lib/session';

export default function MyWorkers() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { data, loading } = useApi<any>('/favourites');
  const [tab, setTab] = useState<'favourites' | 'following' | 'previous'>('favourites');
  if (loading || !data) return <Loading />;
  const list = data[tab] as any[];
  const tabBtn = (k: typeof tab, label: string) => (
    <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-full px-4 py-2 font-semibold ${tab === k ? 'bg-ink text-white' : 'border border-line-strong text-ink'}`}>{label} ({data[k].length})</button>
  );
  return (
    <>
      <div><h1 className="text-4xl font-extrabold">My workers</h1><p className="mt-1 text-muted">Rehire the same plumber, driver or maid in one tap. Saving a worker does not reserve them.</p></div>
      <div className="flex flex-wrap gap-1.5">{tabBtn('favourites', 'Favourites')}{tabBtn('following', 'Following')}{tabBtn('previous', 'Previous workers')}</div>
      {list.length === 0 && <Empty title="No workers here yet" body="Save workers from their profile, or they will appear here after a completed job." action={<Link href="/client/find" className="font-semibold">Find workers →</Link>} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
        {list.map((w) => (
          <div key={w.id} className="card flex flex-col gap-3 p-5">
            <div className="flex items-center gap-3"><Avatar name={w.name} url={api.fileUrl(w.photoUrl)} size={52} /><div className="flex-1"><b className="text-[17px]">{w.name}</b><p className="text-sm text-muted">{w.services[0]} · ★ {w.ratingAvg || 'New'}</p></div></div>
            <p className="text-sm text-slate">{w.timesHired ? `Hired ${w.timesHired} time(s) · last ${date(w.lastHiredAt)}` : 'Not hired yet'}</p>
            <span className="self-start"><Pill tone={w.available ? 'green' : 'grey'}>{w.available ? 'Available now' : 'Not available'}</Pill></span>
            <div className="flex gap-2">
              {w.available ? <Link href={`/client/new-request?worker=${w.id}`} className="flex-1 rounded-xl bg-brand py-2.5 text-center font-semibold text-white no-underline">Send request</Link> : <span className="flex-1 rounded-xl bg-canvas py-2.5 text-center font-semibold text-muted">Send request</span>}
              <Link href={`/client/workers/${w.id}`} className="flex-1 rounded-xl border border-line-strong py-2.5 text-center font-semibold text-ink no-underline">Profile</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
