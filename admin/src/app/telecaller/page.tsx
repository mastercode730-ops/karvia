'use client';

import { ago, dateTime, DOC_LABEL, statusLabel } from '@karvia/shared';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

const OUTCOMES = ['CONTACTED', 'INTERESTED', 'REGISTRATION_PENDING', 'PAYMENT_PENDING', 'READY_FOR_VERIFICATION', 'FOLLOW_UP', 'NOT_INTERESTED'];
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Telecallers see only leads assigned to them; the server enforces this on every call. */
export default function Telecaller() {
  const { user } = useSession();
  const [due, setDue] = useState(true);
  const list = useApi<any>(`/leads${due ? '?due=today' : ''}`, [due]);
  const [sel, setSel] = useState<string | null>(null);
  const lead = useApi<any>(sel ? `/leads/${sel}` : null, [sel]);
  const toast = useToast();
  const [status, setStatus] = useState('CONTACTED');
  const [followUp, setFollowUp] = useState('');
  const [note, setNote] = useState('');
  const [profile, setProfile] = useState({ name: '', experienceYears: '', skills: '', area: '' });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const w = lead.data?.worker;
    if (!lead.data) return;
    setStatus(lead.data.status === 'NEW' ? 'CONTACTED' : lead.data.status);
    setFollowUp(lead.data.followUpAt ? localInput(new Date(lead.data.followUpAt)) : '');
    setProfile({ name: w?.name ?? lead.data.name ?? '', experienceYears: w?.experienceYears != null ? String(w.experienceYears) : '', skills: (w?.skills ?? []).join(', '), area: w?.area ?? '' });
  }, [lead.data]);

  const run = async (k: string, fn: () => Promise<any>, ok: string) => {
    setBusy(k);
    try {
      await fn();
      toast.show(ok);
      lead.reload();
      list.reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(null);
    }
  };
  const l = lead.data;
  const w = l?.worker;

  return (
    <Shell title="Telecaller console" actions={<span className="text-sm text-muted">{user?.name}</span>}>
      {toast.node}
      <div className="flex flex-wrap items-start gap-4">
        <section className="card w-full overflow-hidden lg:w-96">
          <div className="flex gap-1.5 border-b border-line p-3">
            <button onClick={() => setDue(true)} aria-pressed={due} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${due ? 'bg-ink text-white' : 'border border-line-strong'}`}>Due today</button>
            <button onClick={() => setDue(false)} aria-pressed={!due} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!due ? 'bg-ink text-white' : 'border border-line-strong'}`}>All my leads</button>
          </div>
          {list.loading && !list.data && <Loading />}
          {list.error && <ErrorBox message={list.error.message} />}
          {list.data?.items.length === 0 && <p className="p-4 text-muted">{due ? 'No follow-ups due today.' : 'No leads assigned to you yet.'}</p>}
          {list.data?.items.map((x: any) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`block w-full border-b border-line p-3.5 text-left ${sel === x.id ? 'bg-brand-tint' : 'hover:bg-canvas'}`}>
              <b>{x.name ?? `+91 ${x.phone}`}</b>
              <p className="text-[13px] text-muted">{x.category ?? '—'} · {x.area ?? '—'}{x.completion != null ? ` · ${x.completion}% done` : ''}</p>
              <span className="text-xs font-bold text-gold-text">{x.followUpAt ? `FOLLOW-UP ${dateTime(x.followUpAt)}` : statusLabel(x.status).toUpperCase()}</span>
            </button>
          ))}
        </section>
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          {!sel && <Section><p className="text-muted">Choose a lead to start.</p></Section>}
          {l && (
            <>
              <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div><h2 className="text-2xl font-extrabold">{l.name ?? 'New worker'}</h2><p className="text-muted">{l.category ?? '—'} · {l.area ?? '—'} · {statusLabel(l.source)} · updated {ago(l.updatedAt)}</p></div>
                <div className="flex flex-wrap gap-2">
                  <a href={`tel:+91${l.phone}`} className="rounded-xl bg-brand px-4 py-3 font-bold text-white no-underline" onClick={() => api.post(`/leads/${l.id}/call`, { answered: true })}>Call +91 {l.phone}</a>
                  <Button variant="secondary" onClick={() => run('na', () => api.post(`/leads/${l.id}/call`, { answered: false }), 'Logged: no answer')}>No answer</Button>
                  <Button variant="secondary" onClick={() => run('sms', () => api.post(`/leads/${l.id}/send-link`), 'Profile link sent by SMS')}>Send profile link</Button>
                </div>
              </section>
              <div className="flex flex-wrap items-start gap-4">
                <Section className="flex-[2_1_360px]" title={`Profile · ${w?.completion?.percent ?? 0}% complete`}>
                  {w && <div className="flex flex-wrap gap-1.5 text-[13px]">{w.completion.checks.map((c: any) => <span key={c.key} className={`rounded-full px-2.5 py-1 ${c.done ? 'bg-brand-tint text-brand' : 'bg-gold-tint text-gold-text'}`}>{c.done ? '✓ ' : ''}{c.label}</span>)}</div>}
                  {w ? (
                    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run('pf', () => api.patch(`/leads/${l.id}/worker`, { ...(profile.name ? { name: profile.name } : {}), ...(profile.experienceYears ? { experienceYears: Number(profile.experienceYears) } : {}), skills: profile.skills.split(',').map((s) => s.trim()).filter((s) => s.length >= 2), ...(profile.area ? { area: profile.area } : {}) }), 'Profile updated'); }}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Name" htmlFor="pn"><input id="pn" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
                        <Field label="Experience (years)" htmlFor="pe"><input id="pe" type="number" min={0} className="input" value={profile.experienceYears} onChange={(e) => setProfile({ ...profile, experienceYears: e.target.value })} /></Field>
                        <Field label="Skills (comma separated)" htmlFor="ps"><input id="ps" className="input" value={profile.skills} onChange={(e) => setProfile({ ...profile, skills: e.target.value })} /></Field>
                        <Field label="Area" htmlFor="pa"><input id="pa" className="input" value={profile.area} onChange={(e) => setProfile({ ...profile, area: e.target.value })} /></Field>
                      </div>
                      <Button type="submit" variant="secondary" className="self-start" loading={busy === 'pf'}>Save profile fields</Button>
                    </form>
                  ) : <p className="text-muted">This lead has not started registration yet.</p>}
                  {w && <p className="text-[13px] text-muted">Documents: {w.documents.map((d: any) => `${DOC_LABEL[d.type]} (${statusLabel(d.status).toLowerCase()})`).join(', ') || 'none uploaded'}. Telecallers cannot view documents, approve, suspend or refund.</p>}
                </Section>
                <Section className="flex-[1_1_280px]" title="Call outcome">
                  <div className="flex flex-wrap gap-1.5">{OUTCOMES.map((o) => <button key={o} type="button" onClick={() => setStatus(o)} aria-pressed={status === o} className={`rounded-lg px-2.5 py-1.5 text-[13px] ${status === o ? 'bg-brand font-bold text-white' : 'border border-line-strong'}`}>{statusLabel(o)}</button>)}</div>
                  <Field label="Next follow-up" htmlFor="fu"><input id="fu" type="datetime-local" className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
                  <Field label="Note" htmlFor="no"><textarea id="no" rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <Button variant="dark" loading={busy === 'oc'} onClick={() => run('oc', () => api.post(`/leads/${l.id}/outcome`, { status, followUpAt: followUp ? new Date(followUp).toISOString() : null, note: note || undefined }).then(() => setNote('')), 'Outcome saved')}>Save outcome</Button>
                </Section>
              </div>
              <Section title="Activity history">
                <ul className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">{l.activities.map((a: any) => (<li key={a.id} className="contents"><span className="text-muted">{dateTime(a.createdAt)}</span><span>{statusLabel(a.kind)}{a.note ? ` · ${a.note}` : ''}</span></li>))}</ul>
              </Section>
              <Pill status={l.status} />
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
