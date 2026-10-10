'use client';

import { dateTime, DOC_LABEL, PRICING_LABEL, rupees } from '@karvia/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReasonAction, Shell } from '@/components/shell';
import { Avatar, Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function WorkerReview() {
  const { id } = useParams<{ id: string }>();
  return (
    <Shell>
      <Inner id={id} />
    </Shell>
  );
}

function Inner({ id }: { id: string }) {
  const { can } = useSession();
  const { data: w, error, loading, reload } = useApi<any>(`/admin/workers/${id}`);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [extend, setExtend] = useState({ kind: 'WORKER_TRIAL', days: 5, reason: '' });

  if (loading && !w) return <Loading />;
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!w) return null;

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
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
  const viewDoc = async (docId: string) => {
    try {
      const r = await api.get(`/admin/workers/documents/${docId}/url`);
      window.open(api.fileUrl(r.url), '_blank', 'noopener');
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };
  const e = w.eligibility;

  return (
    <>
      {toast.node}
      <Link href="/verification" className="text-sm font-semibold">← Verification queue</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={w.name} url={api.fileUrl(w.photoUrl)} size={64} />
          <div><h1 className="text-3xl font-extrabold">{w.name ?? 'Unnamed worker'}</h1><p className="text-muted">{w.services.map((s: any) => s.name).join(', ') || 'No services'} · {w.area ?? '—'} · +91 {w.phone}</p></div>
        </div>
        <div className="flex gap-2"><Pill status={w.verificationStatus} />{w.userStatus !== 'ACTIVE' && <Pill status={w.userStatus} />}</div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <Section title="Documents" action={<span className="text-[13px] text-muted">Private · each view is logged</span>}>
            {w.documents.length === 0 && <p className="text-muted">No documents uploaded.</p>}
            {w.documents.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                <b className="flex-[1_1_180px]">{DOC_LABEL[d.type]}</b>
                <Pill status={d.status} />
                {can('documents.view') && <Button size="sm" variant="secondary" onClick={() => viewDoc(d.id)}>View</Button>}
                {can('workers.verify') && d.status !== 'VERIFIED' && <Button size="sm" variant="secondary" onClick={() => act(`d${d.id}`, () => api.post(`/admin/workers/documents/${d.id}/review`, { status: 'VERIFIED' }), 'Document verified')}>Mark verified</Button>}
                {can('workers.verify') && d.status !== 'REJECTED' && <ReasonAction label="Reject document" variant="danger" placeholder="What should the worker fix?" onConfirm={(reason) => act(`r${d.id}`, () => api.post(`/admin/workers/documents/${d.id}/review`, { status: 'REJECTED', reason }), 'Document rejected')} />}
              </div>
            ))}
            <p className="text-sm text-muted">Required for these services: {w.completion.requiredDocs.map((t: string) => DOC_LABEL[t]).join(', ') || 'none'}</p>
          </Section>

          <Section title="Profile">
            <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Completion</dt><dd>{w.completion.percent}%{w.completion.missing.length ? ` · missing ${w.completion.missing.join(', ')}` : ''}</dd>
              <dt className="text-muted">Experience</dt><dd>{w.experienceYears ?? '—'} years{w.certifications.length ? ` · ${w.certifications.join(', ')}` : ''}</dd>
              <dt className="text-muted">Skills</dt><dd>{w.skills.join(', ') || '—'}</dd>
              <dt className="text-muted">Languages</dt><dd>{w.languages.join(', ') || '—'}</dd>
              <dt className="text-muted">Pricing</dt><dd>{w.rates.map((r: any) => `${r.label}: ${r.amountPaise != null ? rupees(r.amountPaise) : 'quote'} (${PRICING_LABEL[r.model].toLowerCase()})`).join(' · ') || '—'}</dd>
              <dt className="text-muted">Work history</dt><dd>{w.employment.map((x: any) => `${x.title} · ${x.company}`).join('; ') || '—'}</dd>
              <dt className="text-muted">Location (private)</dt><dd>{w.lat != null ? `${w.area} · ${w.pincode ?? ''} (${w.lat.toFixed(4)}, ${w.lng.toFixed(4)})` : '—'}</dd>
              <dt className="text-muted">Jobs / rating</dt><dd>{w.jobsDone} jobs · {w.ratingCount ? `${w.ratingAvg} ★ (${w.ratingCount})` : 'no reviews'} · complaints against: {w.complaintsAgainst}</dd>
            </dl>
            {w.workPhotos.length > 0 && <div className="flex flex-wrap gap-2">{w.workPhotos.map((p: any) => <img key={p.id} src={api.fileUrl(p.url)} alt="Work sample" className="h-20 w-20 rounded-lg object-cover" />)}</div>}
          </Section>

          <Section title="Activity">
            <ul className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5 text-sm">
              {w.activity.map((a: any) => (<li key={a.id} className="contents"><span className="text-muted">{dateTime(a.createdAt)}</span><span><b>{a.action}</b>{a.reason ? ` · ${a.reason}` : ''}</span></li>))}
              {w.lead?.activities?.map((a: any) => (<li key={a.id} className="contents"><span className="text-muted">{dateTime(a.createdAt)}</span><span>Lead · {a.kind.toLowerCase()}{a.note ? ` · ${a.note}` : ''}</span></li>))}
            </ul>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Section title="Matching eligibility">
            {[['Verified', e.verified], ['Trial / plan active', e.plan], ['AVAILABLE', e.available], ['Services', e.hasServices], ['Location', e.location], ['Account active', e.accountActive]].map(([k, ok]) => (
              <div key={k as string} className="flex justify-between text-sm"><span>{k}</span><b className={ok ? 'text-brand' : 'text-alert-text'}>{ok ? '✓' : '✕'}</b></div>
            ))}
            <p className={`text-sm font-semibold ${e.eligible ? 'text-brand' : 'text-alert-text'}`}>{e.eligible ? 'Receives requests' : 'Not eligible for matching'}</p>
          </Section>
          {can('workers.verify') && (
            <Section title="Decision">
              {w.verificationStatus !== 'VERIFIED' && <Button loading={busy === 'approve'} onClick={() => act('approve', () => api.post(`/admin/workers/${id}/approve`), 'Approved')}>Approve{w.trialUsed ? '' : ' & start free trial'}</Button>}
              <ReasonAction label="Reject" variant="danger" placeholder="Reason shown to the worker" onConfirm={(reason) => act('reject', () => api.post(`/admin/workers/${id}/reject`, { reason }), 'Rejected')} />
              <div className="flex flex-wrap gap-2">
                <ReasonAction label="Suspend" onConfirm={(reason) => act('suspend', () => api.post(`/admin/workers/${id}/suspend`, { reason }), 'Suspended')} />
                <ReasonAction label="Block" variant="danger" onConfirm={(reason) => act('block', () => api.post(`/admin/workers/${id}/block`, { reason }), 'Blocked')} />
                <ReasonAction label="Reactivate" onConfirm={(reason) => act('react', () => api.post(`/admin/workers/${id}/reactivate`, { reason }), 'Reactivated')} />
              </div>
            </Section>
          )}
          {can('subscriptions.edit') && (
            <Section title="Trial / subscription">
              <p className="text-sm">{w.plan ? `${w.plan.kind === 'WORKER_TRIAL' ? 'Trial' : 'Plan'} active · ${w.plan.daysLeft} days left` : 'No active plan'} · trial {w.trialUsed ? 'used' : 'not used'}</p>
              <div className="flex gap-2">
                <Field label="Days" htmlFor="xd"><input id="xd" type="number" min={1} max={365} className="input w-20" value={extend.days} onChange={(ev) => setExtend({ ...extend, days: Number(ev.target.value) })} /></Field>
                <Field label="Add to" htmlFor="xk"><select id="xk" className="input" value={extend.kind} onChange={(ev) => setExtend({ ...extend, kind: ev.target.value })}><option value="WORKER_TRIAL">Trial</option><option value="WORKER_PLAN">Paid plan</option></select></Field>
              </div>
              <Field label="Reason (audit log)" htmlFor="xr"><input id="xr" className="input" value={extend.reason} onChange={(ev) => setExtend({ ...extend, reason: ev.target.value })} /></Field>
              <Button variant="dark" loading={busy === 'extend'} disabled={extend.reason.trim().length < 3} onClick={() => act('extend', () => api.post(`/admin/workers/${id}/subscription/extend`, extend), 'Extended')}>Extend</Button>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
