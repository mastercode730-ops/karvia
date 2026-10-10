'use client';

import { COMPLAINT_LABEL, rupees, statusLabel } from '@karvia/shared';
import { useState } from 'react';
import { Shell } from '@/components/shell';
import { ErrorBox, Loading, Section } from '@/components/ui';
import { useApi } from '@/lib/session';

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">No data in this period.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,180px)_1fr_48px] items-center gap-3 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-4 rounded bg-canvas"><span className="block h-full rounded bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <b className="text-right tabular-nums">{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const { data: d, error, loading, reload } = useApi<any>(`/admin/reports?days=${days}`, [days]);
  return (
    <Shell title="Reports" actions={<><label htmlFor="days" className="sr-only">Period</label><select id="days" className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}</select></>}>
      {loading && !d && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {d && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Section title="Requests by service"><Bars rows={d.requestsByService.map((r: any) => ({ label: r.service ?? '—', value: r.count }))} /></Section>
          <Section title={`Requests by outcome · ${d.conversion}% accepted`}><Bars rows={d.requestsByStatus.map((r: any) => ({ label: statusLabel(r.status), value: r.count }))} /></Section>
          <Section title="Cancellations by"><Bars rows={d.cancellations.map((r: any) => ({ label: statusLabel(r.by ?? 'UNKNOWN'), value: r.count }))} /></Section>
          <Section title="Complaints by reason"><Bars rows={d.complaints.map((r: any) => ({ label: COMPLAINT_LABEL[r.reason] ?? r.reason, value: r.count }))} /></Section>
          <Section title="Revenue">
            {d.revenue.length === 0 && <p className="text-sm text-muted">No payments in this period.</p>}
            {d.revenue.map((r: any) => <div key={r.purpose} className="flex justify-between"><span>{r.purpose === 'CLIENT_ACCESS' ? 'Client access' : 'Worker plans'} · {r.count} payments</span><b>{rupees(r.totalPaise)}</b></div>)}
          </Section>
        </div>
      )}
    </Shell>
  );
}
