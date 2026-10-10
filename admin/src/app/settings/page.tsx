'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

type S = Record<string, any>;
const num = (label: string, key: string, opts: { paise?: boolean; hint?: string } = {}) => ({ label, key, ...opts });

const GROUPS: { title: string; fields: ReturnType<typeof num>[] }[] = [
  { title: 'Client access', fields: [num('Fee (₹)', 'clientAccessFeePaise', { paise: true }), num('Duration (days)', 'clientAccessDays')] },
  { title: 'Worker plan & trial', fields: [num('Plan price (₹)', 'workerPlanPricePaise', { paise: true }), num('Plan days', 'workerPlanDays'), num('Free trial days', 'workerTrialDays', { hint: 'Launch default 5; may be set to 10' }), num('Grace period (days)', 'workerGraceDays', { hint: '0 = off (Phase 1)' }), num('Trials per mobile', 'trialsPerMobile')] },
  { title: 'Requests, quotes & cancellations', fields: [num('Quote validity (minutes)', 'quoteValidityMin'), num('Quote request open for (hours)', 'quoteRequestHours'), num('Late cancel window (minutes)', 'lateCancelMin'), num('No-shows before suspension', 'noShowsBeforeSuspend'), num('Open requests per client', 'maxOpenRequestsPerClient'), num('Requests per client per day', 'maxRequestsPerClientPerDay')] },
];

export default function Settings() {
  const { can } = useSession();
  const { data, error, loading, reload } = useApi<S>('/admin/settings');
  const [form, setForm] = useState<S | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (data) setForm(structuredClone(data));
  }, [data]);
  const editable = can('settings.edit');

  const save = async () => {
    if (!form || !data) return;
    const patch: S = {};
    for (const k of Object.keys(form)) if (JSON.stringify(form[k]) !== JSON.stringify(data[k])) patch[k] = form[k];
    if (!Object.keys(patch).length) return toast.show('Nothing changed');
    setBusy(true);
    try {
      await api.patch('/admin/settings', patch);
      toast.show(`Saved ${Object.keys(patch).length} change(s) · recorded in audit log`);
      reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(false);
    }
  };
  const set = (k: string, v: any) => setForm({ ...form!, [k]: v });

  return (
    <Shell title="Business settings" actions={editable && <Button onClick={save} loading={busy}>Save all</Button>}>
      {toast.node}
      <p className="text-muted">Change business rules without a developer. Every save is audited.{!editable && ' You can view these but not change them.'}</p>
      {loading && !form && <Loading />}
      {error && <ErrorBox message={error.message} onRetry={reload} />}
      {form && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {GROUPS.map((g) => (
            <Section key={g.title} title={g.title}>
              <div className="grid grid-cols-2 gap-3">
                {g.fields.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={f.key} hint={f.hint}>
                    <input id={f.key} type="number" min={0} step={f.paise ? 1 : 1} disabled={!editable} className="input" value={f.paise ? form[f.key] / 100 : form[f.key]} onChange={(e) => set(f.key, f.paise ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))} />
                  </Field>
                ))}
              </div>
              {g.title === 'Client access' && <p className="text-[13px] text-muted">Auto-renewal is locked off by policy.</p>}
            </Section>
          ))}
          <Section title="Tax / GST">
            <p className="rounded-lg bg-gold-tint px-3 py-2 text-sm text-gold-text">Set only as advised by the company’s CA. Leave empty to charge no tax. Nothing is hard-coded.</p>
            <div className="grid grid-cols-2 gap-3">
              {[['Tax on client fee (%)', 'clientTaxPercent'], ['Tax on worker plan (%)', 'workerTaxPercent']].map(([l, k]) => (
                <Field key={k} label={l} htmlFor={k}><input id={k} type="number" min={0} max={28} step={0.01} disabled={!editable} className="input" value={form[k] ?? ''} placeholder="Not set" onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} /></Field>
              ))}
            </div>
          </Section>
          <Section title="Contact & features">
            <Field label="How contact opens after acceptance" htmlFor="cm"><select id="cm" disabled={!editable} className="input" value={form.contactMode} onChange={(e) => set('contactMode', e.target.value)}><option value="DIRECT">Show phone number</option><option value="MASKED">Masked calling (needs a provider)</option></select></Field>
            {[['voiceRequest', 'Voice requirement (client)'], ['voiceRegistration', 'Voice registration (worker)'], ['referrals', 'Referral rewards'], ['inAppChat', 'In-app chat']].map(([k, l]) => (
              <label key={k} className="flex items-center justify-between"><span>{l}</span><input type="checkbox" className="h-5 w-5" disabled={!editable} checked={form.features[k]} onChange={(e) => set('features', { ...form.features, [k]: e.target.checked })} /></label>
            ))}
            <label className="flex items-center justify-between text-muted"><span>Secure payment / escrow (Phase 2)</span><input type="checkbox" className="h-5 w-5" disabled /></label>
          </Section>
        </div>
      )}
    </Shell>
  );
}
