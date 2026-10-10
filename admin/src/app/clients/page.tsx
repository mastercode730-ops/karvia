'use client';

import { date, dateTime, rupees, statusLabel } from '@karvia/shared';
import { useState } from 'react';
import { Pager, ReasonAction, Shell, Table, Td } from '@/components/shell';
import { ErrorBox, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function Clients() {
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/admin/clients?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}${status ? `&status=${status}` : ''}`, [page, q, status]);
  const detail = useApi<any>(open ? `/admin/clients/${open}` : null, [open]);

  const setUserStatus = async (id: string, s: string, reason: string) => {
    try {
      await api.post(`/admin/users/${id}/status`, { status: s, reason });
      toast.show(`Marked ${statusLabel(s).toLowerCase()}`);
      reload();
      detail.reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };

  return (
    <Shell title="Clients">
      {toast.node}
      <div className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input id="q" className="input max-w-sm" placeholder="Search name or mobile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <label htmlFor="st" className="sr-only">Status</label>
        <select id="st" className="input w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{['ACTIVE', 'WARNED', 'SUSPENDED', 'BLOCKED'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Table head={['Client', 'Area', '₹9 access', 'Requests', 'Cancellations', 'Complaints against', 'Status', '']}>
            {data.items.map((c: any) => (
              <tr key={c.id}>
                <Td><b>{c.name ?? '—'}</b><span className="block text-xs text-muted">{c.phone} · joined {date(c.joinedAt)}</span></Td>
                <Td>{c.area ?? '—'}</Td>
                <Td>{c.access.state === 'ACTIVE' ? <Pill tone="green">Active · {c.access.daysLeft} d</Pill> : <Pill tone={c.access.state === 'EXPIRED' ? 'grey' : 'amber'}>{statusLabel(c.access.state)}</Pill>}</Td>
                <Td>{c.requests}</Td>
                <Td>{c.cancellations}</Td>
                <Td>{c.complaintsAgainst}</Td>
                <Td><Pill status={c.status} /></Td>
                <Td className="text-right"><button className="font-semibold text-brand" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Close' : 'View'}</button></Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
      )}
      {open && detail.data && (
        <Section title={`${detail.data.name ?? 'Client'} · +91 ${detail.data.phone}`} action={<Pill status={detail.data.status} />}>
          <p className="text-sm text-muted">Joined {date(detail.data.joinedAt)} · {detail.data.access ? `Access till ${date(detail.data.access.endsAt)}` : 'No active access'}{detail.data.statusReason ? ` · ${detail.data.statusReason}` : ''}</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div><b className="text-sm">Recent requests</b>{detail.data.requests.map((r: any) => <p key={r.id} className="text-sm">{r.code} · {r.service} · {statusLabel(r.status)} · {dateTime(r.createdAt)}</p>)}</div>
            <div><b className="text-sm">Payments</b>{detail.data.payments.map((p: any) => <p key={p.id} className="text-sm">{date(p.createdAt)} · {rupees(p.totalPaise)} · {statusLabel(p.status)}</p>)}</div>
            <div><b className="text-sm">Complaints</b>{detail.data.complaints.map((c: any) => <p key={c.id} className="text-sm">#C-{c.number} · {statusLabel(c.reason)} · {statusLabel(c.status)}</p>)}</div>
          </div>
          {can('clients.edit') && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <ReasonAction label="Warn" onConfirm={(r) => setUserStatus(open, 'WARNED', r)} />
              <ReasonAction label="Suspend" onConfirm={(r) => setUserStatus(open, 'SUSPENDED', r)} />
              <ReasonAction label="Block" variant="danger" onConfirm={(r) => setUserStatus(open, 'BLOCKED', r)} />
              <ReasonAction label="Reactivate" onConfirm={(r) => setUserStatus(open, 'ACTIVE', r)} />
            </div>
          )}
        </Section>
      )}
    </Shell>
  );
}
