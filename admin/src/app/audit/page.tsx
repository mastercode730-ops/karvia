'use client';

import { dateTime } from '@karvia/shared';
import { useState } from 'react';
import { Pager, Shell, Table, Td } from '@/components/shell';
import { ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/session';

const short = (v: unknown) => (v == null ? '' : JSON.stringify(v).slice(0, 120));

export default function Audit() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<any>(`/admin/audit?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ''}`, [page, action]);
  return (
    <Shell title="Audit log">
      <p className="text-muted">Append-only record of sensitive actions: approvals, suspensions, refunds, setting changes, document views and staff logins.</p>
      <label htmlFor="ac" className="sr-only">Filter by action</label>
      <input id="ac" className="input max-w-sm" placeholder="Filter by action, e.g. worker.approve" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <>
          <Table head={['Time', 'Actor', 'Action', 'Entity', 'Before → After', 'Reason', 'IP']} minWidth={1000}>
            {data.items.map((a: any) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-muted">{dateTime(a.createdAt)}</Td>
                <Td>{a.actorName}<span className="block text-xs text-muted">{a.actorRole}</span></Td>
                <Td className="font-semibold">{a.action}</Td>
                <Td className="text-xs">{a.entityType}<span className="block text-muted">{a.entityId?.slice(0, 24)}</span></Td>
                <Td className="max-w-[320px] break-all text-xs">{short(a.before)}{a.before && a.after ? ' → ' : ''}{short(a.after)}</Td>
                <Td className="text-xs">{a.reason ?? ''}</Td>
                <Td className="text-xs text-muted">{a.ip ?? ''}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
        </>
      )}
    </Shell>
  );
}
