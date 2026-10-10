'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/shells';
import { Button, ErrorBox } from '@/components/ui';
import { api, errMsg } from '@/lib/session';

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [role, setRole] = useState<'CLIENT' | 'WORKER'>(params.get('as') === 'worker' ? 'WORKER' : 'CLIENT');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.requestOtp(phone);
      setDevCode(r.devCode ?? null);
      setWait(r.resendAfterSec);
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      await api.verifyOtp(phone, code, role);
      if (role === 'CLIENT') {
        const me = await api.get('/me/client');
        router.replace(!me.profile?.lat ? `/client/onboarding${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}` : safeNext?.startsWith('/client') ? safeNext : '/client');
      } else {
        router.replace(safeNext?.startsWith('/worker') ? safeNext : '/worker');
      }
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  const roleBtn = (r: 'CLIENT' | 'WORKER') =>
    `rounded-xl border-2 px-3.5 py-3 text-left ${role === r ? 'border-brand bg-brand-tint text-brand' : 'border-line bg-white text-slate'}`;

  return (
    <div className="flex min-h-screen flex-wrap bg-canvas">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col justify-between gap-10 bg-brand p-8 text-white sm:p-12">
        <Logo light />
        <div className="flex max-w-md flex-col gap-4">
          <h1 className="text-4xl font-extrabold sm:text-5xl">No password. Just your mobile number.</h1>
          <p className="text-lg text-[#D3EDE3]">We send a one-time code by SMS. Same login for clients and workers.</p>
        </div>
        <p className="text-sm text-[#BFE3D5]">By continuing you agree to the <Link href="/legal" className="text-white">Terms</Link> and <Link href="/legal#privacy" className="text-white">Privacy Policy</Link>.</p>
      </div>
      <div className="flex min-w-0 flex-[1_1_440px] items-center justify-center px-4 py-12">
        <div className="card flex w-full max-w-md flex-col gap-5 p-7 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-muted">I want to</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={roleBtn('CLIENT')} onClick={() => setRole('CLIENT')} aria-pressed={role === 'CLIENT'}><b className="block">Kaam karwao</b><span className="text-sm">Find a worker</span></button>
              <button type="button" className={roleBtn('WORKER')} onClick={() => setRole('WORKER')} aria-pressed={role === 'WORKER'}><b className="block">Kaam pao</b><span className="text-sm">Get work</span></button>
            </div>
          </div>

          {step === 'phone' ? (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="mob" className="label">Mobile number</label>
                <div className="flex overflow-hidden rounded-xl border border-line-strong focus-within:border-brand">
                  <span className="border-r border-line-strong bg-canvas px-3 py-3 font-semibold">+91</span>
                  <input id="mob" inputMode="numeric" autoComplete="tel-national" maxLength={14} className="min-w-0 flex-1 px-3 text-lg tracking-wide outline-none" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="98765 43210" />
                </div>
              </div>
              {error && <ErrorBox message={error} />}
              <Button type="submit" loading={busy} disabled={phone.replace(/\D/g, '').length !== 10}>Send OTP</Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="otp" className="label">Enter 6-digit OTP</label>
                  <button type="button" className="text-sm font-semibold text-brand" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>Change number</button>
                </div>
                <p className="text-sm text-muted">Sent to +91 {phone}</p>
                <input id="otp" ref={otpRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input text-center text-2xl font-bold tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                {devCode && <p className="rounded-lg bg-gold-tint px-3 py-2 text-sm text-gold-text">Development mode: your OTP is <b>{devCode}</b></p>}
                <button type="button" disabled={wait > 0 || busy} onClick={send} className="self-start text-sm font-semibold text-brand disabled:text-muted">{wait > 0 ? `Resend OTP in 0:${String(wait).padStart(2, '0')}` : 'Resend OTP'}</button>
              </div>
              {error && <ErrorBox message={error} />}
              <Button type="submit" loading={busy} disabled={code.length !== 6}>Verify and continue</Button>
            </form>
          )}
          <p className="border-t border-line pt-3.5 text-[13px] text-muted">Max 5 OTP requests per hour per number. Email is optional and can be added later.</p>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
