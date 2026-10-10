'use client';

import { ago, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Pager, Shell, Table, Td } from '@/components/shell';
import { ErrorBox, Loading, Pill } from '@/components/ui';
import { useApi } from '@/lib/session';

const TABS = ['PENDING', 'UNDER_REVIEW', 'INCOMPLETE', 'VERIFIED', 'REJECTED', 'SUSPENDED'];

export default function Verification() {
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/admin/workers?status=${status}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, [status, page, q]);
  return (
    <Shell title="Workers & verification">
      <div className="flex flex-wrap gap-1.5 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={status === t} onClick={() => { setStatus(t); setPage(1); }} className={`px-3.5 py-2.5 font-semibold ${status === t ? 'border-b-[3px] border-brand text-ink' : 'text-muted'}`}>{statusLabel(t)}{data?.counts?.[t] != null ? ` (${data.counts[t]})` : ''}</button>
        ))}
      </div>
      <label htmlFor="q" className="sr-only">Search workers</label>
      <input id="q" className="input max-w-md" placeholder="Search name, mobile or area" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Table head={['Worker', 'Services', 'Area', 'Profile', 'Docs', 'Submitted', 'Source', 'Status', '']}>
            {data.items.map((w: any) => (
              <tr key={w.id}>
                <Td><b>{w.name ?? '—'}</b><span className="block text-xs text-muted">{w.phone}</span></Td>
                <Td>{w.services.join(', ') || '—'}</Td>
                <Td>{w.area ?? '—'}</Td>
                <Td><div className="flex items-center gap-2"><span className="block h-1.5 w-16 overflow-hidden rounded bg-line"><span className={`block h-full ${w.completion >= 90 ? 'bg-brand' : 'bg-gold'}`} style={{ width: `${w.completion}%` }} /></span>{w.completion}%</div></Td>
                <Td>{w.documents}</Td>
                <Td className="text-muted">{w.submittedAt ? ago(w.submittedAt) : '—'}</Td>
                <Td className="text-muted">{w.source ? statusLabel(w.source) : '—'}</Td>
                <Td><Pill status={w.status} /></Td>
                <Td className="text-right"><Link href={`/workers/${w.id}`} className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white no-underline">Review</Link></Td>
              </tr>
            ))}
          </Table>
          {data.items.length === 0 && <p className="text-muted">Nothing in this list.</p>}
          <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
      )}
    </Shell>
  );
}
