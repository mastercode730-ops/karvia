'use client';

import { WorkerShell } from '@/components/shells';
import { Loading, Pill, Section } from '@/components/ui';
import { DocumentsForm } from '@/components/worker-forms';
import { useApi } from '@/lib/session';

const JOURNEY = [
  ['INCOMPLETE', 'Registered'],
  ['PENDING', 'Submitted'],
  ['UNDER_REVIEW', 'Under review'],
  ['VERIFIED', 'Verified'],
];

export default function Documents() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { data: w, loading, setData } = useApi<any>('/worker/me');
  if (loading || !w) return <Loading />;
  const at = JOURNEY.findIndex(([k]) => k === w.verificationStatus);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h1 className="text-4xl font-extrabold">Documents & verification</h1>
      <Section title="Your verification journey">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          {JOURNEY.map(([k, l], i) => (
            <li key={k} className="flex items-center gap-1.5"><span className={`rounded-lg px-3 py-2 ${i < at ? 'bg-brand-tint text-brand' : i === at ? 'bg-gold text-ink' : 'bg-canvas text-muted'}`}>{i < at ? '✓ ' : ''}{l}</span>{i < JOURNEY.length - 1 && <span aria-hidden className="text-line-strong">—</span>}</li>
          ))}
          {['REJECTED', 'SUSPENDED'].includes(w.verificationStatus) && <li><Pill status={w.verificationStatus} /></li>}
        </ol>
        {w.rejectReason && <p className="text-alert-text">Reason: {w.rejectReason}</p>}
        <p className="text-slate">Our team usually reviews within [24–48 hours] after you submit. Documents are stored privately and are never shown to clients.</p>
      </Section>
      <Section title="Your documents"><DocumentsForm w={w} onSaved={setData} /></Section>
    </div>
  );
}
