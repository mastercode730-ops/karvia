'use client';

import { BOOKING_TYPE_LABEL, dateTime, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Pager, Shell, Table, Td } from '@/components/shell';
import { ErrorBox, Loading, Pill } from '@/components/ui';
import { useApi } from '@/lib/session';

const REQ = ['', 'SEARCHING', 'SENT', 'QUOTING', 'NO_WORKER', 'ACCEPTED', 'CANCELLED', 'EXPIRED'];
const BOOK = ['', 'ACCEPTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

function Inner() {
  const p = useSearchParams();
  const [view, setView] = useState<'requests' | 'bookings'>(p.get('view') === 'bookings' ? 'bookings' : 'requests');
  const [status, setStatus] = useState(p.get('status') ?? '');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/admin/${view}?page=${page}${status ? `&status=${status}` : ''}`, [view, status, page]);
  const opts = view === 'requests' ? REQ : BOOK;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(['requests', 'bookings'] as const).map((v) => <button key={v} onClick={() => { setView(v); setStatus(''); setPage(1); }} aria-pressed={view === v} className={`rounded-full px-4 py-2 font-semibold ${view === v ? 'bg-ink text-white' : 'border border-line-strong'}`}>{v === 'requests' ? 'Requests' : 'Bookings'}</button>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((s) => <button key={s} onClick={() => { setStatus(s); setPage(1); }} aria-pressed={status === s} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s ? 'bg-brand text-white' : s === 'NO_WORKER' ? 'border border-gold-line bg-gold-tint text-gold-text' : 'border border-line-strong'}`}>{s ? statusLabel(s) : 'All'}{view === 'requests' && s && data?.counts?.[s] != null ? ` (${data.counts[s]})` : ''}</button>)}
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && view === 'requests' && (
        <Table head={['ID', 'Service', 'Client', 'Worker', 'Type', 'Area', 'Notified', 'Created', 'Status']}>
          {data.items.map((r: any) => (
            <tr key={r.id}>
              <Td><Link href={`/requests/${r.id}`} className="font-semibold">{r.code}</Link></Td>
              <Td>{r.service}</Td><Td>{r.client}</Td><Td>{r.worker ?? '—'}</Td><Td className="text-muted">{BOOKING_TYPE_LABEL[r.bookingType]}</Td>
              <Td>{r.area}</Td><Td>{r.notified} · {r.radiusKm} KM</Td><Td className="text-muted">{dateTime(r.createdAt)}</Td><Td><Pill status={r.status} /></Td>
            </tr>
          ))}
        </Table>
      )}
      {data && view === 'bookings' && (
        <Table head={['ID', 'Service', 'Client', 'Worker', 'When', 'Agreed price', 'Status', '']}>
          {data.items.map((b: any) => (
            <tr key={b.id}>
              <Td className="font-semibold">{b.code}</Td><Td>{b.service}</Td><Td>{b.client}</Td><Td>{b.worker}</Td>
              <Td>{b.scheduledAt ? dateTime(b.scheduledAt) : dateTime(b.createdAt)}</Td><Td>{b.price}</Td><Td><Pill status={b.status} /></Td>
              <Td className="text-right"><Link href={`/bookings/${b.id}`} className="font-semibold">Open</Link></Td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </>
  );
}

export default function Requests() {
  return (
    <Shell title="Requests & bookings">
      <Suspense><Inner /></Suspense>
    </Shell>
  );
}
