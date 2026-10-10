'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, ErrorBox, Field } from '@/components/ui';
import { api, errMsg } from '@/lib/session';

function Inner() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [role, setRole] = useState('ADMIN');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totp, setTotp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'mfa'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (r: string) => {
    const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : r === 'TELECALLER' ? '/telecaller' : '/';
    router.replace(dest);
  };
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-admin px-4">
      <div className="card flex w-full max-w-md flex-col gap-5 p-8">
        <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-display text-xl font-extrabold text-white">K</span><span className="font-display text-2xl font-extrabold">karvia</span><span className="rounded bg-ink px-2 py-0.5 text-xs font-bold text-[#8FD3BA]">STAFF</span></div>
        <h1 className="text-2xl font-extrabold">Staff login</h1>
        {step === 'phone' && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api.requestOtp(phone); setDevCode(r.devCode ?? null); setStep('otp'); }); }}>
            <Field label="Login as" htmlFor="role"><select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="ADMIN">Admin</option><option value="SUBADMIN">Sub-admin</option><option value="TELECALLER">Telecaller</option></select></Field>
            <Field label="Mobile number" htmlFor="ph"><input id="ph" inputMode="numeric" className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))} maxLength={10} placeholder="10-digit mobile" /></Field>
            {error && <ErrorBox message={error} />}
            <Button type="submit" loading={busy} disabled={phone.length !== 10}>Send OTP</Button>
          </form>
        )}
        {step === 'otp' && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api.verifyOtp(phone, code, role); if (r.mfaRequired) { setMfaToken(r.mfaToken!); setStep('mfa'); } else { await api.reloadMe(); go(role); } }); }}>
            <Field label="6-digit OTP" htmlFor="otp"><input id="otp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input text-center text-2xl tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            {devCode && <p className="rounded-lg bg-gold-tint px-3 py-2 text-sm text-gold-text">Development mode: OTP is <b>{devCode}</b></p>}
            {error && <ErrorBox message={error} />}
            <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify</Button>
          </form>
        )}
        {step === 'mfa' && (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.verifyMfa(mfaToken!, totp); await api.reloadMe(); go(role); }); }}>
            <Field label="Code from your authenticator app" htmlFor="totp"><input id="totp" autoFocus inputMode="numeric" maxLength={6} className="input text-center text-2xl tracking-[0.5em]" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} /></Field>
            {error && <ErrorBox message={error} />}
            <Button type="submit" loading={busy} disabled={totp.length !== 6}>Log in</Button>
          </form>
        )}
        <p className="text-[13px] text-muted">Staff accounts are created by an admin. Every login and sensitive action is recorded.</p>
      </div>
    </div>
  );
}

export default function Login() {
  return <Suspense><Inner /></Suspense>;
}
