'use client';

import { ago, statusLabel } from '@karvia/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Loading, Pill, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

const COLUMNS = ['NEW', 'CONTACTED', 'INTERESTED', 'REGISTRATION_PENDING', 'READY_FOR_VERIFICATION', 'PAYMENT_PENDING', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED'];

export default function Leads() {
  const { can } = useSession();
  const [source, setSource] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const { data, error, loading, reload } = useApi<any>(`/leads?${source ? `source=${source}&` : ''}${unassigned ? 'unassigned=true' : ''}`, [source, unassigned]);
  const telecallers = useApi<any[]>('/leads/telecallers');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState('');
  const toast = useToast();

  const assign = async () => {
    try {
      await api.post('/leads/assign', { leadIds: [...selected], assignedToId: assignee || null });
      toast.show(`${selected.size} lead(s) ${assignee ? 'assigned' : 'unassigned'}`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };
  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  return (
    <Shell title="Leads pipeline">
      {toast.node}
      <p className="text-muted">Lead → Assign → Call / message → Follow-up → Status → Convert. Leads are created automatically from incomplete registrations, ending trials and expired plans.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="src" className="sr-only">Source</label>
        <select id="src" className="input w-60" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{['INCOMPLETE_REGISTRATION', 'CATEGORY_INTEREST', 'TRIAL_ENDING', 'EXPIRED_WORKER', 'UNPAID_WORKER', 'VOICE_REGISTRATION', 'WEBSITE', 'REFERRAL'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} /> Unassigned only</label>
        {can('leads.assign') && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm">{selected.size} selected</span>
            <label htmlFor="as" className="sr-only">Telecaller</label>
            <select id="as" className="input w-48" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Unassign</option>{telecallers.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <Button size="sm" variant="dark" onClick={assign}>Apply</Button>
          </div>
        )}
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1500px] items-start gap-3">
            {COLUMNS.map((col) => {
              const items = data.items.filter((l: any) => l.status === col);
              return (
                <div key={col} className="flex flex-1 flex-col gap-2 rounded-xl bg-[#EBEEF2] p-2.5">
                  <div className="flex justify-between px-1"><b className="text-sm">{statusLabel(col)}</b><span className="text-xs font-bold text-muted">{data.counts[col] ?? 0}</span></div>
                  {items.map((l: any) => (
                    <div key={l.id} className={`flex flex-col gap-1 rounded-xl border bg-white p-2.5 text-[13px] ${selected.has(l.id) ? 'border-brand' : 'border-line'}`}>
                      <label className="flex items-start gap-2">{can('leads.assign') && <input type="checkbox" className="mt-1" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.name ?? l.phone}`} />}<b className="text-sm">{l.name ?? `+91 ${l.phone}`}</b></label>
                      <span className="text-muted">{l.category ?? '—'} · {l.area ?? '—'}</span>
                      {l.completion != null && <span>Profile {l.completion}%</span>}
                      <span className="text-muted">{statusLabel(l.source)} · {ago(l.updatedAt)}</span>
                      <span className="self-start"><Pill tone={l.assignedToName ? 'green' : 'grey'}>{l.assignedToName ?? 'Unassigned'}</Pill></span>
                      {l.workerId && <Link href={`/workers/${l.workerId}`} className="text-xs font-semibold">Open profile</Link>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}
