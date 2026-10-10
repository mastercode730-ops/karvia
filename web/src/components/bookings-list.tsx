'use client';

import { BOOKING_TYPE_LABEL, dateTime } from '@karvia/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Empty, ErrorBox, Loading, Pill } from './ui';
import { useApi, useLive } from '@/lib/session';

const TABS = [['upcoming', 'Upcoming'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['disputed', 'Disputed'], ['all', 'All']];

export function BookingsList({ base, title }: { base: string; title: string }) {
  const p = useSearchParams();
  const router = useRouter();
  const tab = p.get('tab') ?? 'upcoming';
  const { data, error, loading, reload } = useApi<any>(`/bookings?tab=${tab}`, [tab]);
  useLive(['booking:update'], reload);
  const c = data?.counts ?? {};
  const count: Record<string, number> = { upcoming: (c.ACCEPTED ?? 0) + (c.CONFIRMED ?? 0), active: c.IN_PROGRESS ?? 0, completed: c.COMPLETED ?? 0, cancelled: c.CANCELLED ?? 0, disputed: c.DISPUTED ?? 0 };
  return (
    <>
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <div className="flex flex-wrap gap-1.5 border-b border-line" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.replace(`${base}?tab=${k}`)} className={`px-3.5 py-2.5 font-semibold ${tab === k ? 'border-b-[3px] border-brand text-ink' : 'text-muted'}`}>{label}{k in count ? ` (${count[k]})` : ''}</button>
        ))}
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data?.items.length === 0 && <Empty title="Nothing here yet" />}
      {data?.items.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[15px]">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted">{['Booking', 'With', 'When', 'Type', 'Agreed price', 'Status', ''].map((h) => <th key={h} className="border-b border-line px-4 py-3">{h}</th>)}</tr></thead>
            <tbody>
              {data.items.map((b: any) => (
                <tr key={b.id}>
                  <td className="border-b border-line px-4 py-3"><b>{b.service}</b><span className="block text-[13px] text-muted">{b.code}</span></td>
                  <td className="border-b border-line px-4 py-3">{b.otherParty ?? '—'}</td>
                  <td className="border-b border-line px-4 py-3">{b.scheduledAt ? dateTime(b.scheduledAt) : dateTime(b.createdAt)}</td>
                  <td className="border-b border-line px-4 py-3 text-muted">{BOOKING_TYPE_LABEL[b.bookingType]}</td>
                  <td className="border-b border-line px-4 py-3 font-semibold">{b.priceSummary}</td>
                  <td className="border-b border-line px-4 py-3"><Pill status={b.status} /></td>
                  <td className="border-b border-line px-4 py-3 text-right"><Link href={`${base}/${b.id}`} className="font-semibold">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

