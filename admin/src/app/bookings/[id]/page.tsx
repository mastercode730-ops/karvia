'use client';

import { dateTime, PRICING_LABEL, rupees, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReasonAction, Shell } from '@/components/shell';
import { ErrorBox, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function AdminBooking() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: b, error, loading, reload } = useApi<any>(`/admin/bookings/${id}`);
  const toast = useToast();
  return (
    <Shell>
      {toast.node}
      <Link href="/requests?view=bookings" className="text-sm font-semibold">← Bookings</Link>
      {loading && !b && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {b && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-muted">{b.code}</p><h1 className="text-3xl font-extrabold">{b.service.name}</h1></div><Pill status={b.status} /></div>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
              <Section title="Parties">
                <p>Client: <b>{b.client.name}</b> · +91 {b.client.phone}</p>
                <p>Worker: <Link href={`/workers/${b.worker.id}`} className="font-bold">{b.worker.name}</Link> · +91 {b.worker.phone}</p>
                <p className="text-sm text-muted">{b.scheduledAt ? dateTime(b.scheduledAt) : 'ASAP'} · {b.addressText}</p>
              </Section>
              <Section title="Agreed price (locked)">
                {b.agreedPrice.kind === 'QUOTE' ? <p>Quote v{b.agreedPrice.version}: {rupees(b.agreedPrice.totalPaise)} (service {rupees(b.agreedPrice.servicePaise)} + material {rupees(b.agreedPrice.materialPaise)})</p> : b.agreedPrice.items.map((i: any, n: number) => <p key={n}>{i.label} · {PRICING_LABEL[i.model]} · {i.amountPaise != null ? rupees(i.amountPaise) : 'quote'}</p>)}
                {b.charges.map((c: any) => <p key={c.id} className="text-sm">{c.label} ({c.kind.toLowerCase()}) {rupees(c.amountPaise)} · {c.approvedAt ? 'approved' : c.rejectedAt ? 'declined' : 'awaiting client'}</p>)}
              </Section>
              <Section title="Status history">
                <ul className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1.5 text-sm">{b.history.map((h: any, i: number) => (<li key={i} className="contents"><span className="text-muted">{dateTime(h.at)}</span><span><b>{statusLabel(h.to)}</b>{h.note ? ` · ${h.note}` : ''}</span></li>))}</ul>
              </Section>
            </div>
            {can('bookings.edit') && ['ACCEPTED', 'CONFIRMED', 'DISPUTED'].includes(b.status) && (
              <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
                <Section title="Admin intervention">
                  <ReasonAction label="Cancel booking" variant="danger" onConfirm={async (reason) => { try { await api.post(`/admin/bookings/${id}/cancel`, { reason }); toast.show('Cancelled; both parties notified'); reload(); } catch (e) { toast.show(errMsg(e), 'red'); } }} />
                </Section>
              </aside>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
