'use client';

import { BOOKING_TYPE_LABEL, dateTime, rupees, statusLabel, time } from '@karvia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Shell, Table, Td } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const { data: r, error, loading, reload } = useApi<any>(`/admin/requests/${id}`);
  const toast = useToast();
  const [radius, setRadius] = useState(15);
  const [workerId, setWorkerId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (k: string, fn: () => Promise<any>, ok: string) => {
    setBusy(k);
    try {
      await fn();
      toast.show(ok);
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell>
      {toast.node}
      <Link href="/requests" className="text-sm font-semibold">← Requests</Link>
      {loading && !r && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {r && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-muted">{r.code} · {BOOKING_TYPE_LABEL[r.bookingType]}</p><h1 className="text-3xl font-extrabold">{r.service.name}</h1></div><Pill status={r.status} /></div>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
              <Section title="Details">
                <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted">Client</dt><dd>{r.clientName}</dd>
                  <dt className="text-muted">Work</dt><dd>{r.description} {r.quantity > 1 ? `· ${r.quantity} workers` : ''}</dd>
                  <dt className="text-muted">When</dt><dd>{r.scheduledAt ? dateTime(r.scheduledAt) : 'ASAP'}</dd>
                  <dt className="text-muted">Where</dt><dd>{r.addressText} ({r.lat.toFixed(4)}, {r.lng.toFixed(4)})</dd>
                  <dt className="text-muted">Search</dt><dd>Round {r.round} · {r.radiusKm} KM{r.targetWorkerId ? ' · direct invite' : ''}</dd>
                </dl>
              </Section>
              <Section title={`Workers notified (${r.offers.length})`}>
                <Table head={['Worker', 'Round', 'Distance', 'Sent', 'Response']} minWidth={560}>
                  {r.offers.map((o: any) => (<tr key={o.id}><Td>{o.workerName}</Td><Td>{o.round}</Td><Td>{o.distanceKm} KM</Td><Td>{time(o.createdAt)}</Td><Td><Pill tone={o.response === 'ACCEPTED' ? 'green' : o.response === 'REJECTED' ? 'red' : 'grey'}>{statusLabel(o.response)}</Pill></Td></tr>))}
                </Table>
              </Section>
              {r.quotes.length > 0 && (
                <Section title="Quotes">
                  {r.quotes.map((q: any) => <p key={q.id} className="text-sm">v{q.version} · {rupees(q.servicePaise + q.materialPaise + q.taxPaise)} · {statusLabel(q.status)}</p>)}
                </Section>
              )}
              <Section title="Status history">
                <ul className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-1.5 text-sm">{r.history.map((h: any) => (<li key={h.id} className="contents"><span className="text-muted">{time(h.createdAt)}</span><span><b>{statusLabel(h.to)}</b>{h.note ? ` · ${h.note}` : ''}</span></li>))}</ul>
              </Section>
            </div>
            {can('bookings.edit') && ['NO_WORKER', 'SEARCHING', 'SENT'].includes(r.status) && (
              <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
                <Section title="Re-route">
                  <Field label="Search radius (KM)" htmlFor="rr"><input id="rr" type="number" min={1} max={200} className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></Field>
                  <Button variant="dark" loading={busy === 'rr'} onClick={() => act('rr', () => api.post(`/admin/requests/${id}/reroute`, { radiusKm: radius }), 'Re-routed')}>Search again</Button>
                </Section>
                <Section title="Assign a worker manually">
                  <Field label="Worker ID" htmlFor="wid" hint="Copy from the worker's review page"><input id="wid" className="input" value={workerId} onChange={(e) => setWorkerId(e.target.value.trim())} /></Field>
                  <Field label="Reason (audit log)" htmlFor="ar"><input id="ar" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <Button loading={busy === 'as'} disabled={!workerId || reason.trim().length < 3} onClick={() => act('as', () => api.post(`/admin/requests/${id}/assign`, { workerId, reason }), 'Offer sent to that worker')}>Send offer to worker</Button>
                  <p className="text-[13px] text-muted">The worker still has to be eligible and accept.</p>
                </Section>
              </aside>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
