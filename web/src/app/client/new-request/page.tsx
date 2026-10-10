'use client';

import { BOOKING_TYPE_LABEL } from '@karvia/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ServiceSelect } from '@/components/service-select';
import { ClientShell } from '@/components/shells';
import { Avatar, Button, ErrorBox, Field, Icon, Loading, Section } from '@/components/ui';
import { FileButton } from '@/components/widgets';
import { api, errMsg, useApi } from '@/lib/session';

export default function NewRequest() {
  return (
    <ClientShell>
      <Suspense><Inner /></Suspense>
    </ClientShell>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function VoiceNote({ onUploaded }: { onUploaded: (id: string) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [state, setState] = useState<'idle' | 'recording' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const chunks = useRef<Blob[]>([]);
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('uploading');
        try {
          const f = new File(chunks.current, 'voice.webm', { type: 'audio/webm' });
          const up = await api.upload('REQUEST_MEDIA', f);
          onUploaded(up.id);
          setState('done');
        } catch (e) {
          setError(errMsg(e));
          setState('idle');
        }
      };
      r.start();
      setRec(r);
      setState('recording');
      setTimeout(() => r.state === 'recording' && r.stop(), 60000);
    } catch {
      setError('Microphone not available. Type the details instead.');
    }
  };
  return (
    <div className="flex flex-col gap-1">
      {state === 'recording' ? (
        <Button type="button" variant="danger" onClick={() => rec?.stop()}>■ Stop recording</Button>
      ) : (
        <Button type="button" variant="secondary" onClick={start} loading={state === 'uploading'} disabled={state === 'done'}>{Icon.mic()} {state === 'done' ? 'Voice note added' : 'Record voice note'}</Button>
      )}
      {error && <span className="text-sm text-alert-text">{error}</span>}
    </div>
  );
}

function Inner() {
  const p = useSearchParams();
  const router = useRouter();
  const me = useApi<any>('/me/client');
  const [serviceId, setServiceId] = useState(p.get('service') ?? '');
  const service = useApi<any>(serviceId ? `/catalog/services/${serviceId}` : null, [serviceId]);
  const workerId = p.get('worker');
  const worker = useApi<any>(workerId ? `/workers/${workerId}` : null);
  const [type, setType] = useState<'INSTANT' | 'SCHEDULED' | 'QUOTE'>((p.get('type') as any) ?? 'INSTANT');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3 * 3600000)));
  const [addressId, setAddressId] = useState('');
  const [media, setMedia] = useState<{ id: string; url: string }[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed: string[] = service.data?.bookingTypes ?? ['INSTANT', 'SCHEDULED', 'QUOTE'];
  useEffect(() => {
    if (service.data && !allowed.includes(type)) setType(allowed[0] as any);
  }, [service.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const def = me.data?.addresses?.find((a: any) => a.isDefault) ?? me.data?.addresses?.[0];
    if (def && !addressId) setAddressId(def.id);
  }, [me.data, addressId]);

  if (me.loading) return <Loading />;
  if (!me.data?.access) {
    return (
      <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-gold-tint p-5">{Icon.lock('#8A5A00')}<p className="flex-1">Unlock 30-day access for ₹9 to send requests.</p><Link href="/client/access" className="rounded-xl bg-ink px-4 py-3 font-semibold text-white no-underline">Unlock access</Link></div>
    );
  }

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post('/requests', {
        serviceId, bookingType: type, description, quantity, addressId,
        mediaFileIds: [...media.map((m) => m.id), ...(voiceId ? [voiceId] : [])],
        ...(type === 'SCHEDULED' ? { scheduledAt: new Date(when).toISOString() } : {}),
        ...(workerId ? { targetWorkerId: workerId } : {}),
      });
      router.replace(`/client/requests/${r.id}`);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const typeBtn = (t: 'INSTANT' | 'SCHEDULED' | 'QUOTE', sub: string) => (
    <button key={t} type="button" disabled={!allowed.includes(t)} onClick={() => setType(t)} aria-pressed={type === t}
      className={`rounded-xl border-2 p-3.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${type === t ? 'border-brand bg-brand-tint text-brand' : 'border-line bg-white text-slate'}`}>
      <b className="block">{BOOKING_TYPE_LABEL[t]}</b><span className="text-[13px]">{sub}</span>
    </button>
  );

  return (
    <>
      <h1 className="text-4xl font-extrabold">New request</h1>
      <div className="flex flex-wrap items-start gap-5">
        <form className="flex min-w-0 flex-[999_1_600px] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {worker.data && (
            <div className="card flex items-center gap-3 p-4"><Avatar name={worker.data.name} url={api.fileUrl(worker.data.photoUrl)} size={44} /><p className="flex-1">Sending only to <b>{worker.data.name}</b>. They can accept or decline.</p><Link href={`/client/new-request?service=${serviceId}`} className="text-sm font-semibold">Send to all nearby instead</Link></div>
          )}
          <Section title="1 · What do you need?">
            <Field label="Service" htmlFor="svc"><ServiceSelect value={serviceId} onChange={setServiceId} /></Field>
            <Field label="Describe the work" htmlFor="desc"><textarea id="desc" rows={3} className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Kitchen tap is leaking from the base" /></Field>
            <div className="flex flex-wrap items-end gap-3">
              <VoiceNote onUploaded={setVoiceId} />
              <FileButton kind="REQUEST_MEDIA" accept="image/jpeg,image/png,image/webp" label="Add photo" onUploaded={(f) => setMedia((m) => [...m, f])} />
              <div className="ml-auto flex items-center gap-2"><label htmlFor="qty" className="text-sm font-semibold">Workers needed</label><input id="qty" type="number" min={1} max={50} className="input w-20 text-center" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} /></div>
            </div>
            {media.length > 0 && <div className="flex flex-wrap gap-2">{media.map((m) => <img key={m.id} src={api.fileUrl(m.url)} alt="Attached" className="h-20 w-20 rounded-lg object-cover" />)}</div>}
          </Section>
          <Section title="2 · When?">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">{[typeBtn('INSTANT', 'As soon as possible'), typeBtn('SCHEDULED', 'Pick a date and time'), typeBtn('QUOTE', 'For big or unclear jobs')]}</div>
            {type === 'SCHEDULED' && (
              <Field label="Date and time" htmlFor="when" hint={service.data ? `Minimum notice ${Math.round(service.data.minNoticeMin / 60)} h · up to ${service.data.maxAdvanceDays} days ahead` : undefined}>
                <input id="when" type="datetime-local" className="input" value={when} min={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
              </Field>
            )}
          </Section>
          <Section title="3 · Where?">
            <select aria-label="Address" className="input" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {me.data.addresses.map((a: any) => <option key={a.id} value={a.id}>{a.label} · {[a.line, a.area, a.pincode].filter(Boolean).join(', ')}</option>)}
            </select>
            <p className="text-[13px] text-muted">Shared with the worker only after they accept. <Link href="/client/profile">Manage addresses</Link></p>
          </Section>
          {error && <ErrorBox message={error} />}
          <Button type="submit" size="lg" loading={busy} disabled={!serviceId || description.trim().length < 3 || !addressId}>
            {type === 'QUOTE' ? 'Ask for quotes' : workerId ? 'Send request' : 'Send to nearby workers'}
          </Button>
        </form>
        <aside className="card flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
          <h2 className="text-xl font-bold">How it works</h2>
          <p className="text-slate">{type === 'QUOTE' ? 'Several workers can quote. Each quote is valid for 30 minutes. Accept one and the booking is confirmed at that price.' : 'Verified workers near you get your request. They have 60 seconds to accept. The first one to accept is locked in, and you confirm.'}</p>
          <p className="text-[13px] text-muted">Included in your ₹9 access. You pay the worker directly after the job.</p>
        </aside>
      </div>
    </>
  );
}
