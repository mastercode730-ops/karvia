'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { Button, ErrorBox, Field, Loading, Section, useToast } from '@/components/ui';
import { api, errMsg, useApi, useSession } from '@/lib/session';

const RULE = ['Verified', 'Active trial / ₹199 plan', 'AVAILABLE', 'Category & service', 'Within radius of the job', 'Free at date/time', 'Advance rules met'];

export default function Matching() {
  const { can } = useSession();
  const settings = useApi<any>('/admin/settings');
  const catalog = useApi<any[]>('/admin/catalog');
  const [f, setF] = useState<any>(null);
  const [test, setTest] = useState({ serviceId: '', lat: 28.6208, lng: 77.3633, radiusKm: 5, bookingType: 'INSTANT' });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (settings.data) setF({ defaultRadiusKm: settings.data.defaultRadiusKm, radiusStepsKm: settings.data.radiusStepsKm.join(', '), acceptTimeoutSec: settings.data.acceptTimeoutSec, maxWorkersNotified: settings.data.maxWorkersNotified, maxOffersPerWorkerPerHour: settings.data.maxOffersPerWorkerPerHour });
  }, [settings.data]);

  const save = async () => {
    setBusy(true);
    try {
      const steps = String(f.radiusStepsKm).split(',').map((s) => Number(s.trim())).filter((n) => n > 0).sort((a, b) => a - b);
      await api.patch('/admin/settings', { defaultRadiusKm: Number(f.defaultRadiusKm), radiusStepsKm: steps, acceptTimeoutSec: Number(f.acceptTimeoutSec), maxWorkersNotified: Number(f.maxWorkersNotified), maxOffersPerWorkerPerHour: Number(f.maxOffersPerWorkerPerHour) });
      toast.show('Matching rules saved');
      settings.reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    try {
      setResult(await api.post('/admin/matching/test', test));
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };
  const services = catalog.data?.flatMap((c) => c.subCategories.flatMap((s: any) => s.services.map((v: any) => ({ id: v.id, name: `${s.name} · ${v.name}` })))) ?? [];

  return (
    <Shell title="Matching rules">
      {toast.node}
      <section className="flex flex-col gap-2.5 rounded-2xl bg-ink p-5 text-white">
        <b className="text-[13px] tracking-wide text-gold">GOLDEN RULE · A WORKER IS ELIGIBLE ONLY IF ALL ARE TRUE</b>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">{RULE.map((r, i) => <span key={r} className="flex items-center gap-2"><span className="rounded-lg bg-ink-2 px-3 py-1.5">{r}</span>{i < RULE.length - 1 && <span className="text-[#7D8AA3]">+</span>}</span>)}</div>
      </section>
      {(settings.loading || !f) && <Loading />}
      {settings.error && <ErrorBox message={settings.error.message} />}
      {f && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Radius & distribution">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default radius (KM)" htmlFor="dr"><input id="dr" type="number" className="input" value={f.defaultRadiusKm} onChange={(e) => setF({ ...f, defaultRadiusKm: e.target.value })} /></Field>
              <Field label="Expansion steps (KM)" htmlFor="rs" hint="e.g. 5, 10, 15, 20"><input id="rs" className="input" value={f.radiusStepsKm} onChange={(e) => setF({ ...f, radiusStepsKm: e.target.value })} /></Field>
              <Field label="Accept window (seconds)" htmlFor="at"><input id="at" type="number" className="input" value={f.acceptTimeoutSec} onChange={(e) => setF({ ...f, acceptTimeoutSec: e.target.value })} /></Field>
              <Field label="Max workers notified" htmlFor="mw"><input id="mw" type="number" className="input" value={f.maxWorkersNotified} onChange={(e) => setF({ ...f, maxWorkersNotified: e.target.value })} /></Field>
              <Field label="Worker cooldown (offers / hour)" htmlFor="cd"><input id="cd" type="number" className="input" value={f.maxOffersPerWorkerPerHour} onChange={(e) => setF({ ...f, maxOffersPerWorkerPerHour: e.target.value })} /></Field>
            </div>
            <p className="text-[13px] text-muted">Distance is measured from the job location, never the worker’s home. Requests go to all eligible workers at once; the first to accept wins and the rest are closed immediately.</p>
            {can('settings.edit') && <Button className="self-start" loading={busy} onClick={save}>Save rules</Button>}
          </Section>
          <Section title="Test the rules">
            <Field label="Service" htmlFor="ts"><select id="ts" className="input" value={test.serviceId} onChange={(e) => setTest({ ...test, serviceId: e.target.value })}><option value="">Choose…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Latitude" htmlFor="tla"><input id="tla" type="number" step="0.0001" className="input" value={test.lat} onChange={(e) => setTest({ ...test, lat: Number(e.target.value) })} /></Field>
              <Field label="Longitude" htmlFor="tln"><input id="tln" type="number" step="0.0001" className="input" value={test.lng} onChange={(e) => setTest({ ...test, lng: Number(e.target.value) })} /></Field>
              <Field label="Radius" htmlFor="trd"><input id="trd" type="number" className="input" value={test.radiusKm} onChange={(e) => setTest({ ...test, radiusKm: Number(e.target.value) })} /></Field>
            </div>
            <Button variant="dark" className="self-start" disabled={!test.serviceId} onClick={run}>Run</Button>
            {result && (
              <div className="flex flex-col gap-1.5 text-sm">
                <p><b>{result.eligibleCount} eligible</b> within {test.radiusKm} KM · {result.verifiedOfferingService} verified workers offer this service anywhere</p>
                {result.eligible.map((e: any) => <p key={e.workerId}>{e.name} · {e.distanceKm} KM</p>)}
              </div>
            )}
          </Section>
        </div>
      )}
    </Shell>
  );
}
