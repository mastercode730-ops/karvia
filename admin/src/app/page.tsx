'use client';

import { rupees, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { Shell } from '@/components/shell';
import { ErrorBox, Loading, Section } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Dashboard() {
  return (
    <Shell title="Dashboard">
      <Inner />
    </Shell>
  );
}

const Tile = ({ label, value, href, tone = 'text-ink' }: { label: string; value: number | string; href?: string; tone?: string }) => {
  const body = (<><span className="text-[13px] text-muted">{label}</span><b className={`block font-display text-3xl font-extrabold ${tone}`}>{value}</b></>);
  return href ? <Link href={href} className="card p-4 text-ink no-underline hover:border-muted">{body}</Link> : <div className="card p-4">{body}</div>;
};

function Inner() {
  const { data: d, error, loading, reload } = useApi<any>('/admin/dashboard');
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!d) return null;
  const n = d.needsAction;
  const reqTotal = Object.values(d.requests as Record<string, number>).reduce((a, b) => a + b, 0) || 1;
  return (
    <>
      <span className="eyebrow">Needs action</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Pending verification" value={n.pendingVerification} href="/verification" tone="text-gold-text" />
        <Tile label="No worker found (7 days)" value={n.noWorkerFound} href="/requests?status=NO_WORKER" tone="text-gold-text" />
        <Tile label="Open complaints" value={n.openComplaints} href="/complaints" tone="text-alert-text" />
        <Tile label="Unassigned leads" value={n.unassignedLeads} href="/leads" />
        <Tile label="Payments pending (24 h)" value={n.paymentIssues} href="/payments?status=CREATED" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Section className="flex-[1_1_300px]" title="Workers">
          <dl className="grid grid-cols-[1fr_auto] gap-1.5 text-sm">
            {[['New this week', d.workers.newThisWeek], ['Verified', d.workers.verified], ['Incomplete registrations', d.workers.incomplete], ['On trial', d.workers.onTrial], ['Paid (₹199)', d.workers.paid], ['Suspended', d.workers.suspended], ['Available right now', d.workers.availableNow]].map(([k, v]) => (<div key={k as string} className="contents"><dt>{k}</dt><dd className="text-right font-bold">{v}</dd></div>))}
          </dl>
        </Section>
        <Section className="flex-[1_1_300px]" title="Clients">
          <dl className="grid grid-cols-[1fr_auto] gap-1.5 text-sm">
            {[['New this week', d.clients.newThisWeek], ['Active ₹9 access', d.clients.activeAccess], ['Access ending in 3 days', d.clients.expiringIn3Days]].map(([k, v]) => (<div key={k as string} className="contents"><dt>{k}</dt><dd className="text-right font-bold">{v}</dd></div>))}
          </dl>
        </Section>
        {d.revenue.length > 0 && (
          <Section className="flex-[1_1_300px]" title="Revenue · last 7 days">
            <b className="font-display text-3xl font-extrabold">{rupees(d.revenue.reduce((a: number, r: any) => a + r.totalPaise, 0))}</b>
            {d.revenue.map((r: any) => <div key={r.purpose} className="flex justify-between text-sm"><span>{r.purpose === 'CLIENT_ACCESS' ? 'Client access' : 'Worker plans'} ({r.count})</span><b>{rupees(r.totalPaise)}</b></div>)}
          </Section>
        )}
      </div>
      <Section title="Requests · last 7 days">
        {Object.keys(d.requests).length === 0 && <p className="text-muted">No requests yet.</p>}
        <div className="flex flex-col gap-2">
          {Object.entries(d.requests as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
            <div key={s} className="grid grid-cols-[150px_1fr_50px] items-center gap-3 text-sm">
              <span>{statusLabel(s)}</span>
              <span className="h-5 rounded bg-canvas"><span className={`block h-full rounded ${s === 'ACCEPTED' ? 'bg-brand' : s === 'CANCELLED' ? 'bg-alert' : s === 'NO_WORKER' || s === 'EXPIRED' ? 'bg-gold' : 'bg-ink'}`} style={{ width: `${(c / reqTotal) * 100}%` }} /></span>
              <b className="text-right tabular-nums">{c}</b>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
