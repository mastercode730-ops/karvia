'use client';

import { ago, COMPLAINT_LABEL, dateTime, rupees, statusLabel } from '@karvia/shared';
import { useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function Complaints() {
  const { can } = useSession();
  const [status, setStatus] = useState('OPEN');
  const [sel, setSel] = useState<string | null>(null);
  const list = useApi<any>(`/admin/complaints?${status ? `status=${status}` : ''}`, [status]);
  const c = useApi<any>(sel ? `/admin/complaints/${sel}` : null, [sel]);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [action, setAction] = useState('NONE');
  const [busy, setBusy] = useState(false);

  const resolve = async (next: string) => {
    setBusy(true);
    try {
      await api.post(`/admin/complaints/${sel}/resolve`, { status: next, resolution: resolution || undefined, action });
      toast.show('Saved');
      c.reload();
      list.reload();
      setAction('NONE');
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Complaints">
      {toast.node}
      <div className="flex flex-wrap items-start gap-4">
        <section className="card w-full overflow-hidden lg:w-96">
          <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
            {['OPEN', 'UNDER_REVIEW', 'RESOLVED', ''].map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s ? 'bg-ink text-white' : 'border border-line-strong'}`}>{s ? statusLabel(s) : 'All'}{s && list.data?.counts?.[s] != null ? ` (${list.data.counts[s]})` : ''}</button>)}
          </div>
          {list.loading && !list.data && <Loading />}
          {list.data?.items.length === 0 && <p className="p-4 text-muted">No complaints here.</p>}
          {list.data?.items.map((x: any) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`block w-full border-b border-line p-3.5 text-left ${sel === x.id ? 'bg-gold-tint' : 'hover:bg-canvas'}`}>
              <div className="flex justify-between gap-2"><b>#{x.code} · {COMPLAINT_LABEL[x.reason]}</b><span className={`text-[11px] font-bold ${x.priority === 'HIGH' ? 'text-alert-text' : 'text-gold-text'}`}>{x.priority}</span></div>
              <p className="text-[13px] text-muted">{x.reporterName} → {x.againstName ?? '—'} · {ago(x.createdAt)}</p>
            </button>
          ))}
        </section>
        <section className="card flex min-w-0 flex-[999_1_480px] flex-col gap-4 p-5">
          {!sel && <p className="text-muted">Choose a complaint to review.</p>}
          {c.error && <ErrorBox message={c.error.message} />}
          {c.data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-bold">#{c.data.code} · {COMPLAINT_LABEL[c.data.reason]}</h2><Pill status={c.data.status} /></div>
              <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Reported by</dt><dd>{c.data.reporterName} ({c.data.reporterRole.toLowerCase()})</dd>
                <dt className="text-muted">Against</dt><dd>{c.data.against ? `${c.data.against.name} · ${c.data.against.roles.join(', ').toLowerCase()} · ${statusLabel(c.data.against.status)} · ${c.data.against.warnings} past warnings` : '—'}</dd>
                <dt className="text-muted">Booking</dt><dd>{c.data.bookingId ?? '—'}</dd>
                <dt className="text-muted">Amount</dt><dd>{c.data.amountPaise != null ? `${rupees(c.data.amountPaise)} by ${c.data.paidVia}` : '—'}</dd>
                <dt className="text-muted">Opened</dt><dd>{dateTime(c.data.createdAt)}</dd>
              </dl>
              <p className="rounded-xl bg-canvas p-3">“{c.data.description}”</p>
              {c.data.evidence.length > 0 && <div className="flex flex-wrap gap-2">{c.data.evidence.map((e: any, i: number) => <a key={e.id} href={api.fileUrl(e.url)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line px-3 py-2 text-sm">Evidence {i + 1}</a>)}</div>}
              <div className="flex flex-col gap-2"><b>Notes</b>{c.data.notes.map((n: any) => <p key={n.id} className="text-sm"><span className="text-muted">{dateTime(n.createdAt)} · {n.authorName}:</span> {n.text}</p>)}
                {can('complaints.edit') && <div className="flex gap-2"><label htmlFor="nt" className="sr-only">Note</label><input id="nt" className="input" placeholder="Add an internal note" value={note} onChange={(e) => setNote(e.target.value)} /><Button variant="secondary" disabled={note.trim().length < 2} onClick={async () => { await api.post(`/admin/complaints/${sel}/notes`, { text: note }); setNote(''); c.reload(); }}>Add</Button></div>}
              </div>
              {can('complaints.edit') && (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <b>Decision</b>
                  <Field label="Action against the reported account" htmlFor="ac"><select id="ac" className="input" value={action} onChange={(e) => setAction(e.target.value)}><option value="NONE">No action</option><option value="WARN">Send warning</option><option value="VERIFICATION_REVIEW">Send worker back to verification</option><option value="SUSPEND">Suspend</option><option value="BLOCK">Block</option></select></Field>
                  <Field label="Resolution message (sent to the reporter)" htmlFor="rs"><textarea id="rs" rows={2} className="input" value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
                  <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} onClick={() => resolve('UNDER_REVIEW')}>Mark under review</Button><Button loading={busy} onClick={() => resolve('RESOLVED')}>Resolve</Button></div>
                  <p className="text-xs text-muted">Karvia does not issue automatic refunds for direct payments between users.</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
