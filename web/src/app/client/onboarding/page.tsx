'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Logo } from '@/components/shells';
import { Button, ErrorBox, Field, Loading } from '@/components/ui';
import { LocationPicker, type Picked } from '@/components/widgets';
import { api, errMsg, useRequireRole } from '@/lib/session';

function Inner() {
  const { user, ready } = useRequireRole('CLIENT');
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loc, setLoc] = useState<Picked | null>(null);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setEmail(user.email ?? '');
      setTerms(user.termsAccepted);
    }
  }, [user]);

  if (!ready || !user) return <Loading />;

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.patch('/me', { name, email: email.trim() || null, ...(terms && !user.termsAccepted ? { acceptTerms: true } : {}) });
      await api.patch('/me/client/location', { lat: loc!.lat, lng: loc!.lng, area: loc!.area, ...(loc!.pincode ? { pincode: loc!.pincode } : {}) });
      const existing = await api.get('/me/client');
      if (!existing.addresses.length) {
        await api.post('/me/addresses', { label: 'Home', line: loc!.label ?? loc!.area, area: loc!.area, lat: loc!.lat, lng: loc!.lng, ...(loc!.pincode ? { pincode: loc!.pincode } : {}), isDefault: true });
      }
      await api.reloadMe();
      router.replace(existing.access ? (next?.startsWith('/client') ? next : '/client') : '/client/access');
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-3.5">
          <Logo />
          <div className="flex items-center gap-2 text-sm text-muted"><span className="h-1.5 w-7 rounded bg-brand" /><span className="h-1.5 w-7 rounded bg-brand" /><span className="h-1.5 w-7 rounded bg-line-strong" />Step 2 of 3</div>
        </div>
      </header>
      <div className="flex justify-center px-4 py-12">
        <form className="card flex w-full max-w-xl flex-col gap-5 p-7 sm:p-8" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div><h1 className="text-3xl font-extrabold">Tell us your name and location</h1><p className="mt-1 text-muted">We use your location to show workers within 5 KM of your job.</p></div>
          <Field label="Your name" htmlFor="nm"><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <div className="flex flex-col gap-1.5"><span className="label">Location</span><LocationPicker value={loc} onChange={setLoc} /></div>
          <Field label="Email (optional)" htmlFor="em" hint="For receipts and booking updates"><input id="em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <label className="flex items-start gap-2.5"><input type="checkbox" className="mt-1 h-5 w-5" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> <span>I agree to the <Link href="/legal">Terms</Link> and <Link href="/legal#privacy">Privacy Policy</Link></span></label>
          {error && <ErrorBox message={error} />}
          <Button type="submit" loading={busy} disabled={name.trim().length < 2 || !loc || !terms}>Continue</Button>
        </form>
      </div>
    </div>
  );
}

export default function Onboarding() {
  return <Suspense><Inner /></Suspense>;
}
