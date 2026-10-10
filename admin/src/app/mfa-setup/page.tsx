'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button, ErrorBox, Field, Loading } from '@/components/ui';
import { api, errMsg, useStaff } from '@/lib/session';

/** First staff login: two-factor authentication must be turned on before any admin screen opens. */
export default function MfaSetup() {
  const { user, ready, reload } = useStaff();
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    if (!user.mfaPending) {
      router.replace(user.activeRole === 'TELECALLER' ? '/telecaller' : '/');
      return;
    }
    api.post('/auth/mfa/setup').then(async (r) => {
      setSecret(r.secret);
      setQr(await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }));
    }).catch((e) => setError(errMsg(e)));
  }, [ready, user, router]);

  if (!ready || !user) return <div className="p-8"><Loading /></div>;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form className="card flex w-full max-w-lg flex-col gap-5 p-8" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api.post('/auth/mfa/enable', { code });
          await reload();
          router.replace(user.activeRole === 'TELECALLER' ? '/telecaller' : '/');
        } catch (err) {
          setError(errMsg(err));
          setBusy(false);
        }
      }}>
        <h1 className="text-2xl font-extrabold">Turn on two-factor authentication</h1>
        <p className="text-slate">Staff accounts can change business rules and see private data, so every login needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar).</p>
        <ol className="list-decimal space-y-1 pl-5 text-slate"><li>Open your authenticator app and add an account.</li><li>Scan this QR code, or type the key below.</li><li>Enter the 6-digit code the app shows.</li></ol>
        {qr ? <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="self-center rounded-xl border border-line" /> : <Loading />}
        {secret && <p className="break-all rounded-lg bg-canvas px-3 py-2 text-center font-mono text-sm">{secret}</p>}
        <Field label="6-digit code" htmlFor="code"><input id="code" inputMode="numeric" maxLength={6} className="input text-center text-2xl tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
        {error && <ErrorBox message={error} />}
        <Button type="submit" loading={busy} disabled={code.length !== 6}>Turn on and continue</Button>
      </form>
    </div>
  );
}
