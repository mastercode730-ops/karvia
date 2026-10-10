'use client';

import { BOOKING_TYPE_LABEL, DOC_LABEL, PRICING_LABEL } from '@karvia/shared';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Pill, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi } from '@/lib/session';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BLANK = { name: '', nameHi: '', slug: '', active: true, bookingTypes: ['INSTANT', 'SCHEDULED'], pricingModels: ['PER_VISIT'], durationMin: 60, minNoticeMin: 120, maxAdvanceDays: 15, freeCancelMin: 60, requiredDocs: ['AADHAAR', 'ADDRESS_PROOF'], needsWorkHistory: false };

export default function Categories() {
  const { data, error, loading, reload } = useApi<any[]>('/admin/catalog');
  const [sel, setSel] = useState<{ type: 'service'; id: string | null; subId: string } | null>(null);
  const [form, setForm] = useState<any>(BLANK);
  const [newCat, setNewCat] = useState('');
  const [newSub, setNewSub] = useState<{ catId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!sel || !data) return;
    if (!sel.id) return setForm({ ...BLANK, subCategoryId: sel.subId });
    const svc = data.flatMap((c) => c.subCategories.flatMap((s: any) => s.services)).find((v: any) => v.id === sel.id);
    if (svc) setForm({ ...svc, nameHi: svc.nameHi ?? '' });
  }, [sel, data]);

  const toggleIn = (k: string, v: string) => setForm({ ...form, [k]: form[k].includes(v) ? form[k].filter((x: string) => x !== v) : [...form[k], v] });
  const save = async () => {
    setBusy(true);
    try {
      const body = { subCategoryId: form.subCategoryId, name: form.name, nameHi: form.nameHi || null, slug: form.slug || slugify(form.name), active: form.active, sortOrder: form.sortOrder ?? 0, bookingTypes: form.bookingTypes, pricingModels: form.pricingModels, durationMin: Number(form.durationMin), minNoticeMin: Number(form.minNoticeMin), maxAdvanceDays: Number(form.maxAdvanceDays), freeCancelMin: Number(form.freeCancelMin), requiredDocs: form.requiredDocs, needsWorkHistory: form.needsWorkHistory };
      const r = sel?.id ? await api.patch(`/admin/services/${sel.id}`, body) : await api.post('/admin/services', body);
      toast.show('Service saved');
      setSel({ type: 'service', id: r.id, subId: r.subCategoryId });
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(false);
    }
  };
  const simple = async (fn: () => Promise<any>) => {
    try {
      await fn();
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };

  return (
    <Shell title="Categories" actions={<form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); simple(() => api.post('/admin/categories', { name: newCat, slug: slugify(newCat) })).then(() => setNewCat('')); }}><label htmlFor="nc" className="sr-only">New category</label><input id="nc" className="input" placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><Button type="submit" disabled={newCat.trim().length < 2}>Add</Button></form>}>
      {toast.node}
      <p className="text-muted">Category → Sub-category → Service → Booking type → Pricing model</p>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {data && (
        <div className="flex flex-wrap items-start gap-4">
          <section className="card flex w-full flex-col gap-1 p-3 text-sm lg:w-80">
            {data.map((c) => (
              <div key={c.id} className="flex flex-col">
                <div className="flex items-center justify-between px-2 py-1.5"><b className={c.active ? '' : 'text-muted'}>{c.name}</b><button className="text-xs font-semibold text-muted" onClick={() => simple(() => api.patch(`/admin/categories/${c.id}`, { active: !c.active }))}>{c.active ? 'Deactivate' : 'Activate'}</button></div>
                {c.subCategories.map((s: any) => (
                  <div key={s.id} className="flex flex-col pl-3">
                    <div className="flex items-center justify-between px-2 py-1"><span className={`font-semibold ${s.active ? '' : 'text-muted'}`}>{s.name}</span><button className="text-xs font-semibold text-brand" onClick={() => setSel({ type: 'service', id: null, subId: s.id })}>+ service</button></div>
                    {s.services.map((v: any) => (
                      <button key={v.id} onClick={() => setSel({ type: 'service', id: v.id, subId: s.id })} className={`rounded-lg px-2 py-1.5 pl-5 text-left ${sel?.id === v.id ? 'bg-brand-tint font-bold text-brand' : v.active ? '' : 'text-muted'}`}>{v.name}{!v.active && ' (inactive)'}</button>
                    ))}
                  </div>
                ))}
                {newSub?.catId === c.id ? (
                  <form className="flex gap-1 pl-5" onSubmit={(e) => { e.preventDefault(); simple(() => api.post('/admin/subcategories', { categoryId: c.id, name: newSub!.name, slug: slugify(newSub!.name) })).then(() => setNewSub(null)); }}><input aria-label="Sub-category name" className="input !py-1.5" value={newSub!.name} onChange={(e) => setNewSub({ catId: c.id, name: e.target.value })} /><Button size="sm" type="submit">Add</Button></form>
                ) : <button className="px-5 py-1 text-left text-xs font-semibold text-brand" onClick={() => setNewSub({ catId: c.id, name: '' })}>+ sub-category</button>}
              </div>
            ))}
          </section>
          <Section className="min-w-0 flex-[999_1_480px]" title={sel ? (sel.id ? form.name : 'New service') : 'Choose a service'}>
            {!sel && <p className="text-muted">Pick a service on the left to edit how it is booked and priced.</p>}
            {sel && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Service name" htmlFor="sn"><input id="sn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, ...(sel.id ? {} : { slug: slugify(e.target.value) }) })} /></Field>
                  <Field label="Hindi name" htmlFor="sh"><input id="sh" className="input" value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} /></Field>
                </div>
                <div className="flex flex-col gap-2"><span className="label">Allowed booking types</span><div className="flex flex-wrap gap-2">{Object.keys(BOOKING_TYPE_LABEL).map((t) => <label key={t} className={`flex gap-1.5 rounded-full px-3 py-1.5 ${form.bookingTypes.includes(t) ? 'bg-ink text-white' : 'border border-line-strong'}`}><input type="checkbox" checked={form.bookingTypes.includes(t)} onChange={() => toggleIn('bookingTypes', t)} />{BOOKING_TYPE_LABEL[t]}</label>)}</div></div>
                <div className="flex flex-col gap-2"><span className="label">Allowed pricing models</span><div className="flex flex-wrap gap-2">{Object.keys(PRICING_LABEL).map((t) => <label key={t} className={`flex gap-1.5 rounded-full px-3 py-1.5 ${form.pricingModels.includes(t) ? 'bg-ink text-white' : 'border border-line-strong'}`}><input type="checkbox" checked={form.pricingModels.includes(t)} onChange={() => toggleIn('pricingModels', t)} />{PRICING_LABEL[t]}</label>)}</div></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Duration (min)" htmlFor="du"><input id="du" type="number" className="input" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} /></Field>
                  <Field label="Min notice (min)" htmlFor="mn"><input id="mn" type="number" className="input" value={form.minNoticeMin} onChange={(e) => setForm({ ...form, minNoticeMin: e.target.value })} /></Field>
                  <Field label="Max advance (days)" htmlFor="ma"><input id="ma" type="number" className="input" value={form.maxAdvanceDays} onChange={(e) => setForm({ ...form, maxAdvanceDays: e.target.value })} /></Field>
                  <Field label="Free cancel until (min before)" htmlFor="fc"><input id="fc" type="number" className="input" value={form.freeCancelMin} onChange={(e) => setForm({ ...form, freeCancelMin: e.target.value })} /></Field>
                </div>
                <div className="flex flex-col gap-2"><span className="label">Verification documents required</span><div className="flex flex-wrap gap-2">{Object.keys(DOC_LABEL).map((t) => <label key={t} className="flex gap-1.5 rounded-lg border border-line-strong px-3 py-1.5"><input type="checkbox" checked={form.requiredDocs.includes(t)} onChange={() => toggleIn('requiredDocs', t)} />{DOC_LABEL[t]}</label>)}</div></div>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.needsWorkHistory} onChange={(e) => setForm({ ...form, needsWorkHistory: e.target.checked })} /> Ask for employment history & resume (office-staff style)</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active <Pill tone={form.active ? 'green' : 'grey'}>{form.active ? 'Visible' : 'Hidden'}</Pill></label>
                <Button className="self-start" loading={busy} disabled={form.name.trim().length < 2 || !form.bookingTypes.length || !form.pricingModels.length} onClick={save}>Save service</Button>
              </>
            )}
          </Section>
        </div>
      )}
    </Shell>
  );
}
