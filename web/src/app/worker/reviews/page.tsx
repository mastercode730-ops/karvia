'use client';

import { date } from '@karvia/shared';
import Link from 'next/link';
import { WorkerShell } from '@/components/shells';
import { Loading, Section, Stars } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Reviews() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { data } = useApi<any>('/worker/me/reviews');
  if (!data) return <Loading />;
  const max = Math.max(1, ...data.distribution.map((d: any) => d.count));
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
        <h1 className="text-4xl font-extrabold">Reviews</h1>
        <section className="card flex flex-wrap items-center gap-6 p-6">
          <div><b className="font-display text-6xl font-extrabold leading-none">{data.ratingCount ? data.ratingAvg : '—'}</b><p className="text-muted">{data.ratingCount} reviews · {data.jobsDone} jobs</p></div>
          <div className="flex flex-[1_1_280px] flex-col gap-1.5 text-sm">
            {data.distribution.map((d: any) => (
              <div key={d.stars} className="flex items-center gap-2"><span className="w-6">{d.stars}★</span><span className="h-2 flex-1 overflow-hidden rounded bg-line"><span className="block h-full bg-[#B7791F]" style={{ width: `${(d.count / max) * 100}%` }} /></span><span className="w-6 text-right">{d.count}</span></div>
            ))}
          </div>
        </section>
        <Section>
          {data.items.length === 0 && <p className="text-muted">Reviews appear here after clients rate completed jobs.</p>}
          {data.items.map((r: any) => (
            <div key={r.id} className="border-b border-line py-3.5 last:border-0">
              <div className="flex justify-between"><span className="text-sm text-muted">{date(r.createdAt)}</span><Stars value={r.stars} /></div>
              {r.text && <p className="mt-1 text-slate">{r.text}</p>}
            </div>
          ))}
        </Section>
      </div>
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 lg:mt-14">
        <Section title="Report a client"><p className="text-sm text-muted">Client didn’t pay, cancelled late, unsafe location, or misbehaved.</p><Link href="/worker/report" className="self-start rounded-xl bg-alert px-4 py-3 font-semibold text-white no-underline">Report a problem</Link></Section>
        <div className="rounded-2xl bg-gold-tint p-4 text-sm leading-relaxed">Warnings on your account: <b>{data.warnings}</b>. Repeated no-shows or late cancellations lead to warnings, then suspension.</div>
      </aside>
    </div>
  );
}
