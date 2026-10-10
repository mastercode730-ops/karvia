'use client';

import { DOC_LABEL, PRICING_LABEL } from '@karvia/shared';
import { useEffect, useState } from 'react';
import { api, errMsg, useApi } from '@/lib/session';
import { Avatar, Button, ErrorBox, Field, Pill } from './ui';
import { FileButton, LocationPicker, type Picked } from './widgets';

type W = any;
interface FormProps {
  w: W;
  onSaved: (w: W) => void;
  submitLabel?: string;
}

function useSaver(onSaved: (w: W) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await fn();
      const fresh = await api.get('/worker/me');
      onSaved(fresh);
      setSaved(true);
      return true;
    } catch (e) {
      setError(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, saved, save };
}

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x.length >= 2);

export function BasicsForm({ w, onSaved, submitLabel = 'Save' }: FormProps) {
  const [name, setName] = useState(w.name ?? '');
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(w.photoFileId ? { id: w.photoFileId, url: w.photoUrl } : null);
  const s = useSaver(onSaved);
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); s.save(() => api.patch('/worker/me', { name, ...(photo ? { photoFileId: photo.id } : {}) })); }}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} url={photo ? api.fileUrl(photo.url) : null} size={88} />
        <FileButton kind="PROFILE_PHOTO" accept="image/jpeg,image/png,image/webp" label={photo ? 'Change photo' : 'Upload photo'} onUploaded={(f) => setPhoto(f)} />
      </div>
      <Field label="Full name" htmlFor="wn"><input id="wn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      {s.error && <ErrorBox message={s.error} />}
      <Button type="submit" className="self-start" loading={s.busy} disabled={name.trim().length < 2}>{submitLabel}</Button>
      {s.saved && <span className="text-sm text-brand">✓ Saved</span>}
    </form>
  );
}

export function ServicesForm({ w, onSaved, submitLabel = 'Save' }: FormProps) {
  const { data: catalog } = useApi<any[]>('/catalog');
  const [selected, setSelected] = useState<Set<string>>(new Set(w.services.map((x: any) => x.id)));
  const [catId, setCatId] = useState<string>('');
  const [loc, setLoc] = useState<Picked | null>(w.lat != null ? { lat: w.lat, lng: w.lng, area: w.area ?? '', pincode: w.pincode ?? undefined } : null);
  const s = useSaver(onSaved);
  useEffect(() => {
    if (!catalog || catId) return;
    const first = catalog.find((c) => c.subCategories.some((sc: any) => sc.services.some((v: any) => selected.has(v.id)))) ?? catalog[0];
    setCatId(first?.id ?? '');
  }, [catalog, catId, selected]);
  const cat = catalog?.find((c) => c.id === catId);
  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); s.save(() => api.patch('/worker/me', { serviceIds: [...selected], ...(loc ? { lat: loc.lat, lng: loc.lng, area: loc.area, ...(loc.pincode ? { pincode: loc.pincode } : {}) } : {}) })); }}>
      <div className="flex flex-col gap-2">
        <span className="label">Category</span>
        <div className="flex flex-wrap gap-2">
          {catalog?.map((c) => <button type="button" key={c.id} onClick={() => setCatId(c.id)} aria-pressed={catId === c.id} className={`rounded-xl px-3.5 py-2.5 ${catId === c.id ? 'border-2 border-brand bg-brand-tint font-semibold text-brand' : 'border border-line-strong'}`}>{c.name}</button>)}
        </div>
      </div>
      {cat?.subCategories.map((sc: any) => (
        <div key={sc.id} className="flex flex-col gap-2">
          <span className="label">{sc.name} services</span>
          <div className="flex flex-wrap gap-2">
            {sc.services.map((v: any) => (
              <label key={v.id} className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 ${selected.has(v.id) ? 'bg-ink text-white' : 'border border-line-strong'}`}>
                <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} /> {v.name}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1.5"><span className="label">Your work area</span><LocationPicker value={loc} onChange={setLoc} /><span className="text-[13px] text-muted">Used only to match you with nearby jobs. Never shown to clients.</span></div>
      {s.error && <ErrorBox message={s.error} />}
      <Button type="submit" className="self-start" loading={s.busy} disabled={!selected.size || !loc}>{submitLabel}</Button>
      {s.saved && <span className="text-sm text-brand">✓ Saved</span>}
    </form>
  );
}

export function ExperienceForm({ w, onSaved, submitLabel = 'Save' }: FormProps) {
  const [years, setYears] = useState<string>(w.experienceYears != null ? String(w.experienceYears) : '');
  const [skills, setSkills] = useState((w.skills ?? []).join(', '));
  const [langs, setLangs] = useState((w.languages ?? []).join(', '));
  const [certs, setCerts] = useState((w.certifications ?? []).join(', '));
  const [bio, setBio] = useState(w.bio ?? '');
  const [advance, setAdvance] = useState<boolean>(w.advanceBooking ?? true);
  const [notice, setNotice] = useState<number>(w.minNoticeMin ?? 120);
  const [maxDays, setMaxDays] = useState<number>(w.maxAdvanceDays ?? 15);
  const s = useSaver(onSaved);
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); s.save(() => api.patch('/worker/me', { experienceYears: years === '' ? null : Number(years), skills: splitList(skills), languages: splitList(langs), certifications: splitList(certs), bio: bio.trim() || null, advanceBooking: advance, minNoticeMin: notice, maxAdvanceDays: maxDays })); }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Experience (years)" htmlFor="ey"><input id="ey" type="number" min={0} max={60} className="input" value={years} onChange={(e) => setYears(e.target.value)} /></Field>
        <Field label="Skills" htmlFor="sk" hint="Separate with commas"><input id="sk" className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Leak detection, CPVC fitting" /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Languages" htmlFor="lg" hint="Separate with commas"><input id="lg" className="input" value={langs} onChange={(e) => setLangs(e.target.value)} placeholder="Hindi, English" /></Field>
        <Field label="Certifications (optional)" htmlFor="ct"><input id="ct" className="input" value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="ITI Plumbing 2015" /></Field>
      </div>
      <Field label="About you (optional)" htmlFor="bio"><textarea id="bio" rows={3} className="input" value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
      <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4">
        <label className="flex items-center justify-between gap-3"><b>Accept advance (scheduled) bookings</b><input type="checkbox" className="h-5 w-5" checked={advance} onChange={(e) => setAdvance(e.target.checked)} /></label>
        {advance && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum notice" htmlFor="mn"><select id="mn" className="input" value={notice} onChange={(e) => setNotice(Number(e.target.value))}>{[30, 60, 120, 240, 720, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hours`}</option>)}</select></Field>
            <Field label="Book up to" htmlFor="mx"><select id="mx" className="input" value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))}>{[3, 7, 15, 30, 60].map((d) => <option key={d} value={d}>{d} days ahead</option>)}</select></Field>
          </div>
        )}
      </div>
      {s.error && <ErrorBox message={s.error} />}
      <Button type="submit" className="self-start" loading={s.busy} disabled={years === ''}>{submitLabel}</Button>
      {s.saved && <span className="text-sm text-brand">✓ Saved</span>}
    </form>
  );
}

export function RatesForm({ w, onSaved, submitLabel = 'Save prices' }: FormProps) {
  const models: string[] = [...new Set<string>(w.services.flatMap((x: any) => x.pricingModels))];
  const [rows, setRows] = useState<{ label: string; model: string; amount: string; serviceId: string }[]>(
    w.rates.length ? w.rates.map((r: any) => ({ label: r.label, model: r.model, amount: r.amountPaise != null ? String(r.amountPaise / 100) : '', serviceId: r.serviceId ?? '' })) : [{ label: '', model: models[0] ?? 'PER_VISIT', amount: '', serviceId: '' }],
  );
  const s = useSaver(onSaved);
  if (!w.services.length) return <p className="text-muted">Choose your services first, then set prices.</p>;
  const set = (i: number, k: string, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const modelsFor = (sid: string) => (sid ? w.services.find((x: any) => x.id === sid)?.pricingModels ?? models : models);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); s.save(() => api.put('/worker/me/rates', { rates: rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), model: r.model, serviceId: r.serviceId || null, amountPaise: r.model === 'CUSTOM_QUOTE' ? null : Math.round(Number(r.amount) * 100) })) })); }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="border-b border-line p-2">Item</th><th className="border-b border-line p-2">For service</th><th className="border-b border-line p-2">Pricing model</th><th className="border-b border-line p-2">Rate (₹)</th><th className="border-b border-line p-2" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border-b border-line p-2"><input aria-label="Item" className="input" value={r.label} onChange={(e) => set(i, 'label', e.target.value)} placeholder="Visit charge" /></td>
                <td className="border-b border-line p-2"><select aria-label="Service" className="input" value={r.serviceId} onChange={(e) => set(i, 'serviceId', e.target.value)}><option value="">All my services</option>{w.services.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                <td className="border-b border-line p-2"><select aria-label="Pricing model" className="input" value={r.model} onChange={(e) => set(i, 'model', e.target.value)}>{modelsFor(r.serviceId).map((m: string) => <option key={m} value={m}>{PRICING_LABEL[m]}</option>)}</select></td>
                <td className="border-b border-line p-2"><input aria-label="Rate" inputMode="decimal" className="input w-28" disabled={r.model === 'CUSTOM_QUOTE'} value={r.model === 'CUSTOM_QUOTE' ? '' : r.amount} placeholder={r.model === 'CUSTOM_QUOTE' ? 'Quote' : ''} onChange={(e) => set(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))} /></td>
                <td className="border-b border-line p-2"><button type="button" className="text-sm font-semibold text-alert-text" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="self-start font-semibold text-brand" onClick={() => setRows([...rows, { label: '', model: models[0] ?? 'PER_VISIT', amount: '', serviceId: '' }])}>+ Add rate</button>
      <p className="text-[13px] text-muted">Changing a price affects new bookings only. Confirmed bookings keep the agreed price. Material is charged at actual cost and shown separately.</p>
      {s.error && <ErrorBox message={s.error} />}
      <Button type="submit" className="self-start" loading={s.busy}>{submitLabel}</Button>
      {s.saved && <span className="text-sm text-brand">✓ Saved</span>}
    </form>
  );
}

export function HistoryForm({ w, onSaved, submitLabel = 'Save' }: FormProps) {
  const [items, setItems] = useState<any[]>(w.employment.length ? w.employment.map((e: any) => ({ company: e.company, title: e.title, startDate: e.startDate ?? '', endDate: e.endDate ?? '', responsibilities: e.responsibilities ?? '' })) : []);
  const [salary, setSalary] = useState(w.expectedSalary ?? '');
  const [pref, setPref] = useState(w.preferredLocation ?? '');
  const [joining, setJoining] = useState(w.joining ?? '');
  const s = useSaver(onSaved);
  const set = (i: number, k: string, v: string) => setItems(items.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); s.save(async () => { await api.put('/worker/me/employment', { items: items.filter((x) => x.company.trim() && x.title.trim()).map((x) => ({ ...x, startDate: x.startDate || null, endDate: x.endDate || null, responsibilities: x.responsibilities || null })) }); await api.patch('/worker/me', { expectedSalary: salary || null, preferredLocation: pref || null, joining: joining || null }); }); }}>
      {items.map((x, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company / employer" htmlFor={`co${i}`}><input id={`co${i}`} className="input" value={x.company} onChange={(e) => set(i, 'company', e.target.value)} /></Field>
            <Field label="Job title" htmlFor={`ti${i}`}><input id={`ti${i}`} className="input" value={x.title} onChange={(e) => set(i, 'title', e.target.value)} /></Field>
            <Field label="From" htmlFor={`fr${i}`}><input id={`fr${i}`} className="input" value={x.startDate} onChange={(e) => set(i, 'startDate', e.target.value)} placeholder="Apr 2019" /></Field>
            <Field label="To" htmlFor={`to${i}`}><input id={`to${i}`} className="input" value={x.endDate} onChange={(e) => set(i, 'endDate', e.target.value)} placeholder="Mar 2023 or Present" /></Field>
          </div>
          <Field label="Responsibilities" htmlFor={`rs${i}`}><textarea id={`rs${i}`} rows={2} className="input" value={x.responsibilities} onChange={(e) => set(i, 'responsibilities', e.target.value)} /></Field>
          <button type="button" className="self-start text-sm font-semibold text-alert-text" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove job</button>
        </div>
      ))}
      <button type="button" className="self-start font-semibold text-brand" onClick={() => setItems([...items, { company: '', title: '', startDate: '', endDate: '', responsibilities: '' }])}>+ Add job</button>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Expected salary / rate" htmlFor="es"><input id="es" className="input" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="₹ per month" /></Field>
        <Field label="Preferred work location" htmlFor="pl"><input id="pl" className="input" value={pref} onChange={(e) => setPref(e.target.value)} /></Field>
        <Field label="Can join" htmlFor="jn"><select id="jn" className="input" value={joining} onChange={(e) => setJoining(e.target.value)}><option value="">—</option><option>Immediately</option><option>In 15 days</option><option>In 30 days</option></select></Field>
      </div>
      {s.error && <ErrorBox message={s.error} />}
      <Button type="submit" className="self-start" loading={s.busy}>{submitLabel}</Button>
      {s.saved && <span className="text-sm text-brand">✓ Saved</span>}
    </form>
  );
}

export function DocumentsForm({ w, onSaved }: FormProps) {
  const [type, setType] = useState<string>(w.completion.requiredDocs.find((t: string) => !w.documents.some((d: any) => d.type === t && d.status !== 'REJECTED')) ?? 'AADHAAR');
  const s = useSaver(onSaved);
  const required: string[] = w.completion.requiredDocs;
  const status = (t: string) => w.documents.find((d: any) => d.type === t && d.status !== 'REJECTED') ?? w.documents.find((d: any) => d.type === t);
  return (
    <div className="flex flex-col gap-3">
      {required.length === 0 && <p className="text-muted">Choose your services first. Required documents depend on the service.</p>}
      {[...new Set([...required, ...w.documents.map((d: any) => d.type)])].map((t) => {
        const d = status(t);
        return (
          <div key={t} className={`flex flex-wrap items-center gap-3.5 rounded-xl p-3.5 ${d?.status === 'REJECTED' ? 'border border-alert/40 bg-[#FFF8F7]' : 'border border-line'}`}>
            <div className="flex-[1_1_220px]"><b>{DOC_LABEL[t]}</b>{required.includes(t) && <span className="ml-2 text-xs font-bold text-muted">REQUIRED</span>}<p className="text-sm text-muted">{d?.status === 'REJECTED' ? `Rejected: ${d.rejectReason}` : d ? 'Uploaded · stored privately, never shown publicly' : 'Not uploaded yet'}</p></div>
            {d ? <Pill status={d.status} /> : <Pill tone="grey">Missing</Pill>}
            {d && d.status !== 'VERIFIED' && <Button size="sm" variant="danger" onClick={() => s.save(() => api.del(`/worker/me/documents/${d.id}`))}>Remove</Button>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-canvas p-4">
        <Field label="Upload a document" htmlFor="dt"><select id="dt" className="input" value={type} onChange={(e) => setType(e.target.value)}>{Object.keys(DOC_LABEL).map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}</select></Field>
        <FileButton kind="DOCUMENT" accept="image/jpeg,image/png,image/webp,application/pdf" label="Choose file (JPG, PNG, PDF)" onUploaded={(f) => s.save(() => api.post('/worker/me/documents', { type, fileId: f.id }))} />
      </div>
      {s.error && <ErrorBox message={s.error} />}
    </div>
  );
}

export function WorkPhotosForm({ w, onSaved }: FormProps) {
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>(w.workPhotos ?? []);
  const s = useSaver(onSaved);
  const persist = (next: { id: string; url: string }[]) => {
    setPhotos(next);
    s.save(() => api.patch('/worker/me', { workPhotoIds: next.map((p) => p.id) }));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {photos.map((p) => (
          <div key={p.id} className="relative"><img src={api.fileUrl(p.url)} alt="Work sample" className="aspect-square w-full rounded-xl object-cover" /><button type="button" aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-white px-2 text-sm font-bold" onClick={() => persist(photos.filter((x) => x.id !== p.id))}>✕</button></div>
        ))}
      </div>
      {photos.length < 20 && <FileButton kind="WORK_PHOTO" accept="image/jpeg,image/png,image/webp" label="+ Add work photo" small onUploaded={(f) => persist([...photos, f])} />}
      {s.error && <ErrorBox message={s.error} />}
    </div>
  );
}
