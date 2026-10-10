'use client';

import { BOOKING_TYPE_LABEL, dateTime } from '@karvia/shared';
import Link from 'next/link';
import { ClientShell } from '@/components/shells';
import { Empty, ErrorBox, Loading, Pill } from '@/components/ui';
import { useApi, useLive } from '@/lib/session';

export default function Requests() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { data, error, loading, reload } = useApi<any[]>('/requests?scope=all');
  useLive(['request:update'], reload);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-extrabold">My requests</h1>
        <Link href="/client/new-request" className="rounded-xl bg-brand px-4 py-3 font-semibold text-white no-underline">+ New request</Link>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data?.length === 0 && <Empty title="No requests yet" body="Send a request and nearby verified workers will be notified." />}
      <div className="flex flex-col gap-2.5">
        {data?.map((r) => (
          <Link key={r.id} href={`/client/requests/${r.id}`} className="card flex flex-wrap items-center gap-4 p-4 text-ink no-underline hover:border-muted">
            <div className="min-w-0 flex-1"><b>{r.service}</b><p className="text-sm text-muted">{r.code} · {BOOKING_TYPE_LABEL[r.bookingType]} · {r.scheduledAt ? dateTime(r.scheduledAt) : dateTime(r.createdAt)}</p></div>
            {r.quotes > 0 && <span className="text-sm font-semibold text-info">{r.quotes} quote(s)</span>}
            <Pill status={r.status} />
          </Link>
        ))}
      </div>
    </>
  );
}
