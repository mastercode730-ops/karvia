'use client';

import { date, rupees } from '@karvia/shared';
import { useRouter } from 'next/navigation';
import { ClientShell } from '@/components/shells';
import { ErrorBox, Loading } from '@/components/ui';
import { PayButton } from '@/components/widgets';
import { useApi, useSession } from '@/lib/session';

export default function Access() {
  return (
    <ClientShell>
      <AccessInner />
    </ClientShell>
  );
}

function AccessInner() {
  const { user } = useSession();
  const router = useRouter();
  const quote = useApi<any>('/payments/quote/CLIENT_ACCESS');
  const me = useApi<any>('/me/client');
  if (quote.loading || me.loading) return <Loading />;
  if (quote.error) return <ErrorBox message={quote.error.message} onRetry={quote.reload} />;
  const q = quote.data;
  const start = me.data?.access ? new Date(me.data.access.endsAt) : new Date();
  const end = new Date(start.getTime() + q.days * 86400000);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-4">
        <span className="self-start rounded-xl bg-gold px-4 py-1.5 font-display text-3xl font-extrabold">{rupees(q.amountPaise)}</span>
        <h1 className="text-4xl font-extrabold">{me.data?.access ? 'Extend your access' : `Unlock ${q.days} days of Karvia`}</h1>
        <p className="text-lg leading-relaxed text-slate">Hi {user?.name?.split(' ')[0]}. One small payment shows you every verified worker near you and lets you send as many requests as you need.</p>
        <ul className="card flex flex-col gap-2.5 p-5">
          {['Full worker profiles: experience, skills, price, reviews', 'Switch between workers as often as you like', 'Unlimited requests (fair-use limits apply)', 'Favourites list to rehire the same worker', 'No auto-renewal. You renew when you want.'].map((t) => (
            <li key={t} className="flex gap-2.5"><span className="font-bold text-brand">✓</span>{t}</li>
          ))}
        </ul>
      </div>
      <div className="card flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-6">
        <h2 className="text-2xl font-bold">Payment summary</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-2.5">
          <dt>Client access · {q.days} days</dt><dd>{rupees(q.amountPaise)}</dd>
          {q.taxPercent != null && (<><dt className="text-muted">Tax / GST ({q.taxPercent}%)</dt><dd className="text-muted">{rupees(q.taxPaise)}</dd></>)}
          <dt className="border-t border-line pt-2.5 font-bold">Total</dt><dd className="border-t border-line pt-2.5 font-bold">{rupees(q.totalPaise)}</dd>
        </dl>
        <p className="text-sm text-muted">Valid: {date(start)} → {date(end)}</p>
        <PayButton purpose="CLIENT_ACCESS" label={`Pay ${rupees(q.totalPaise)} securely`} phone={user?.phone} onPaid={() => router.replace('/client?paid=1')} />
        <p className="text-[13px] leading-relaxed text-muted">No refund after access is activated. Duplicate or failed charges are reviewed by our team. Access unlocks only after the payment is confirmed.</p>
      </div>
    </div>
  );
}
