'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WorkerShell } from '@/components/shells';
import { Button, ErrorBox, Loading } from '@/components/ui';
import { BasicsForm, DocumentsForm, ExperienceForm, HistoryForm, RatesForm, ServicesForm } from '@/components/worker-forms';
import { api, errMsg, useApi } from '@/lib/session';

const STEPS = [
  { key: 'basics', label: 'Name & photo', checks: ['name', 'photo'] },
  { key: 'services', label: 'Service & location', checks: ['services', 'location'] },
  { key: 'experience', label: 'Experience & skills', checks: ['experience', 'skills'] },
  { key: 'pricing', label: 'Pricing', checks: ['pricing'] },
  { key: 'history', label: 'Work history', checks: ['history'] },
  { key: 'documents', label: 'Documents', checks: ['documents'] },
  { key: 'submit', label: 'Submit for verification', checks: [] },
] as const;

export default function Register() {
  return (
    <WorkerShell allowIncomplete>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { data, loading, setData } = useApi<any>('/worker/me');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume where the worker stopped: first step with a missing required item.
  useEffect(() => {
    if (!data) return;
    const done = (k: string) => data.completion.checks.find((c: any) => c.key === k)?.done;
    const first = STEPS.findIndex((s) => s.checks.some((k) => !done(k)));
    setStep(first === -1 ? STEPS.length - 1 : first);
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) return <Loading />;
  const w = data;
  const done = (s: (typeof STEPS)[number]) => s.checks.length > 0 && s.checks.every((k) => w.completion.checks.find((c: any) => c.key === k)?.done);
  const saved = (fresh: any) => {
    setData(fresh);
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.post('/worker/me/submit');
      router.replace('/worker?submitted=1');
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };
  const current = STEPS[step];

  return (
    <>
      <div className="rounded-xl bg-gold-tint px-4 py-3.5"><b>Profile {w.completion.percent}% complete.</b> You can stop anytime and continue later. Clients see you only after Karvia verifies your profile.</div>
      {w.verificationStatus === 'REJECTED' && <ErrorBox message={`Changes needed: ${w.rejectReason}`} />}
      <div className="flex flex-wrap items-start gap-5">
        <nav className="card flex w-full flex-col gap-1 p-4 lg:w-72" aria-label="Registration steps">
          <div className="mb-3 h-2 overflow-hidden rounded bg-line"><div className="h-full bg-brand" style={{ width: `${w.completion.percent}%` }} /></div>
          {STEPS.map((s, i) => (
            <button key={s.key} type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-2.5 rounded-xl p-2.5 text-left ${i === step ? 'bg-brand-tint font-bold text-brand' : 'text-ink'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done(s) ? 'bg-brand text-white' : i === step ? 'border-2 border-brand bg-white' : 'border-2 border-line-strong text-muted'}`}>{done(s) ? '✓' : i + 1}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <section className="card flex min-w-0 flex-[999_1_600px] flex-col gap-5 p-6">
          <div><span className="eyebrow">Step {step + 1} of {STEPS.length}</span><h1 className="text-3xl font-extrabold">{current.label}</h1></div>
          {current.key === 'basics' && <BasicsForm w={w} onSaved={saved} submitLabel="Save & continue" />}
          {current.key === 'services' && <ServicesForm w={w} onSaved={saved} submitLabel="Save & continue" />}
          {current.key === 'experience' && <ExperienceForm w={w} onSaved={saved} submitLabel="Save & continue" />}
          {current.key === 'pricing' && <RatesForm w={w} onSaved={saved} submitLabel="Save & continue" />}
          {current.key === 'history' && (w.completion.checks.find((c: any) => c.key === 'history')?.required ? <HistoryForm w={w} onSaved={saved} submitLabel="Save & continue" /> : <><p className="text-muted">Work history is optional for your services. Add it in your profile anytime.</p><Button className="self-start" onClick={() => setStep(step + 1)}>Continue</Button></>)}
          {current.key === 'documents' && (<><DocumentsForm w={w} onSaved={setData} /><Button className="self-start" onClick={() => setStep(step + 1)}>Continue</Button></>)}
          {current.key === 'submit' && (
            <div className="flex flex-col gap-3">
              {w.completion.missing.length ? <ErrorBox message={`Complete these first: ${w.completion.missing.join(', ')}`} /> : <p>Everything is ready. Our team usually reviews within [24–48 hours].</p>}
              {['PENDING', 'UNDER_REVIEW'].includes(w.verificationStatus) && <p className="rounded-xl bg-brand-tint px-4 py-3 text-brand">Submitted. We are reviewing your profile.</p>}
              {error && <ErrorBox message={error} />}
              <Button className="self-start" loading={busy} disabled={w.completion.missing.length > 0 || ['PENDING', 'UNDER_REVIEW', 'VERIFIED'].includes(w.verificationStatus)} onClick={submit}>Submit for verification</Button>
            </div>
          )}
          <div className="border-t border-line pt-4"><button type="button" className="font-semibold text-muted" onClick={() => router.push('/worker')}>Save & finish later</button></div>
        </section>
      </div>
    </>
  );
}
