'use client';

import { useEffect, useState } from 'react';
import { ClientShell } from '@/components/shells';
import { Button, ErrorBox, Field, Loading, Section, useToast } from '@/components/ui';
import { LocationPicker, type Picked } from '@/components/widgets';
import { api, errMsg, useApi, useSession } from '@/lib/session';

export default function Profile() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { user, logout, refreshUser } = useSession();
  const me = useApi<any>('/me/client');
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('en');
  const [marketing, setMarketing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Home');
  const [line, setLine] = useState('');
  const [loc, setLoc] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setEmail(user.email ?? '');
    api.get('/auth/me').then((u) => setMarketing(!!u.marketingConsent)).catch(() => undefined);
  }, [user]);

  if (!user || me.loading) return <Loading />;

  const save = async () => {
    setError(null);
    try {
      await api.patch('/me', { name, email: email.trim() || null, language, marketingConsent: marketing });
      await refreshUser();
      toast.show('Saved');
    } catch (e) {
      setError(errMsg(e));
    }
  };
  const addAddress = async () => {
    try {
      await api.post('/me/addresses', { label, line, area: loc!.area, lat: loc!.lat, lng: loc!.lng, ...(loc!.pincode ? { pincode: loc!.pincode } : {}) });
      setAdding(false);
      setLine('');
      setLoc(null);
      me.reload();
    } catch (e) {
      toast.show(errMsg(e), 'red');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {toast.node}
      <h1 className="text-4xl font-extrabold">My profile</h1>
      <Section title="Personal details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="n"><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Mobile (login)" htmlFor="m"><input id="m" className="input" value={`+91 ${user.phone}`} disabled /></Field>
          <Field label="Email (optional)" htmlFor="e"><input id="e" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add email for receipts" /></Field>
          <Field label="Language" htmlFor="l"><select id="l" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="hi">हिन्दी</option></select></Field>
        </div>
        <label className="flex items-center justify-between gap-3 border-t border-line pt-3"><span><b>Offers and news</b><span className="block text-sm text-muted">Optional. Booking and payment updates always arrive.</span></span><input type="checkbox" className="h-5 w-5" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /></label>
        {error && <ErrorBox message={error} />}
        <Button className="self-start" onClick={save}>Save changes</Button>
      </Section>
      <Section title="Saved addresses" action={!adding && <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>+ Add address</Button>}>
        {me.data.addresses.map((a: any) => (
          <div key={a.id} className={`flex flex-wrap items-center gap-3 rounded-xl p-3.5 ${a.isDefault ? 'border-2 border-brand' : 'border border-line-strong'}`}>
            <b className="flex-[1_1_240px]">{a.label} · {[a.line, a.area, a.pincode].filter(Boolean).join(', ')}</b>
            {a.isDefault ? <span className="text-xs font-bold text-brand">DEFAULT</span> : <Button size="sm" variant="ghost" onClick={async () => { await api.patch(`/me/addresses/${a.id}`, { isDefault: true }); me.reload(); }}>Make default</Button>}
            {!a.isDefault && <Button size="sm" variant="danger" onClick={async () => { await api.del(`/me/addresses/${a.id}`); me.reload(); }}>Remove</Button>}
          </div>
        ))}
        {adding && (
          <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
              <Field label="Label" htmlFor="al"><input id="al" className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
              <Field label="House / flat, street" htmlFor="ali"><input id="ali" className="input" value={line} onChange={(e) => setLine(e.target.value)} /></Field>
            </div>
            <LocationPicker value={loc} onChange={setLoc} />
            <div className="flex gap-2"><Button onClick={addAddress} disabled={!loc || line.trim().length < 3}>Save address</Button><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button></div>
          </div>
        )}
      </Section>
      <Section title="Account">
        <p className="text-sm text-muted">To get a copy of your data or delete your account, raise a request from Help. Our team confirms by phone first.</p>
        <Button variant="dark" className="self-start" onClick={logout}>Log out</Button>
      </Section>
    </div>
  );
}
