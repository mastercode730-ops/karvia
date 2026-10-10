'use client';

import { dateTime, rupees, statusLabel } from '@karvia/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Pager, ReasonAction, Shell, Table, Td } from '@/components/shell';
import { ErrorBox, Loading, Pill, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

function Inner() {
  const { can } = useSession();
  const p = useSearchParams();
  const [status, setStatus] = useState(p.get('status') ?? '');
  const [purpose, setPurpose] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/admin/payments?page=${page}${status ? `&status=${status}` : ''}${purpose ? `&purpose=${purpose}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, [status, purpose, q, page]);
  const today = (pur: string) => (data?.today ?? []).filter((t: any) => t.purpose === pur && t.status === 'SUCCESS')[0];
  return (
    <>
      {toast.node}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Client ₹9 · last 24 h', today('CLIENT_ACCESS')], ['Worker plans · last 24 h', today('WORKER_PLAN')]].map(([l, t]: any) => (
            <div key={l} className="card p-4"><span className="text-[13px] text-muted">{l}</span><b className="block font-display text-2xl font-extrabold">{rupees(t?._sum?.totalPaise ?? 0)}</b><span className="text-xs text-muted">{t?._count ?? 0} payments</span></div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" className="input max-w-sm" placeholder="Search mobile or transaction ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label htmlFor="pu" className="sr-only">Plan</label>
        <select id="pu" className="input w-48" value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="">All plans</option><option value="CLIENT_ACCESS">Client ₹9</option><option value="WORKER_PLAN">Worker ₹199</option></select>
        <label htmlFor="st" className="sr-only">Status</label>
        <select id="st" className="input w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['SUCCESS', 'CREATED', 'PENDING', 'FAILED', 'REFUNDED'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Table head={['Time', 'User', 'Plan', 'Amount', 'Order / payment ID', 'Status', '']} minWidth={940}>
            {data.items.map((x: any) => (
              <tr key={x.id}>
                <Td className="text-muted">{dateTime(x.createdAt)}</Td>
                <Td><b>{x.user.name ?? '—'}</b><span className="block text-xs text-muted">{x.user.phone}</span></Td>
                <Td>{x.purpose === 'CLIENT_ACCESS' ? 'Client access' : 'Worker plan'}</Td>
                <Td className="font-semibold">{rupees(x.totalPaise)}</Td>
                <Td className="text-xs text-muted">{x.providerOrderId}<br />{x.providerPaymentId ?? '—'}</Td>
                <Td><Pill status={x.status} />{x.failureReason && <span className="block text-xs text-muted">{x.failureReason}</span>}</Td>
                <Td>{can('payments.refund') && x.status === 'SUCCESS' && <ReasonAction label="Mark refunded" onConfirm={async (reason) => { try { await api.post(`/admin/payments/${x.id}/refund`, { reason }); toast.show('Marked refunded'); reload(); } catch (e) { toast.show(errMsg(e), 'red'); } }} />}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
          <p className="text-[13px] text-muted">Access unlocks only on a verified payment confirmation. Refunds here are recorded manually after you refund in the Razorpay dashboard. Job payments between clients and workers do not go through Karvia.</p>
        </>
      )}
    </>
  );
}

export default function Payments() {
  return (
    <Shell title="Payments & subscriptions">
      <Suspense><Inner /></Suspense>
    </Shell>
  );
}
