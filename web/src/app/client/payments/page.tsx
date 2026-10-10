'use client';

import { date } from '@karvia/shared';
import Link from 'next/link';
import { ClientShell } from '@/components/shells';
import { PaymentsHistory } from '@/components/shared-pages';
import { Loading, Pill, Section } from '@/components/ui';
import { useApi } from '@/lib/session';

export default function Payments() {
  return (
    <ClientShell>
      <Inner />
    </ClientShell>
  );
}

function Inner() {
  const { data } = useApi<any>('/me/subscription');
  if (!data) return <Loading />;
  const a = data.clientAccess;
  return (
    <>
      <h1 className="text-4xl font-extrabold">Subscription & payments</h1>
      <div className="flex flex-wrap gap-4">
        <Section className="flex-[1_1_420px]" title="Client access" action={<Pill status={a ? 'ACTIVE' : 'EXPIRED'}>{a ? 'Active' : 'Not active'}</Pill>}>
          {a ? (
            <>
              <div className="flex flex-wrap gap-7">
                <div><span className="text-[13px] text-muted">Started</span><b className="block">{date(a.startsAt)}</b></div>
                <div><span className="text-[13px] text-muted">Ends</span><b className="block">{date(a.endsAt)}</b></div>
                <div><span className="text-[13px] text-muted">Days left</span><b className="block">{a.daysLeft}</b></div>
              </div>
              <p className="text-sm text-muted">No auto-renewal. We’ll remind you 3 days before it ends.</p>
              <Link href="/client/access" className="self-start font-semibold">Add 30 more days →</Link>
            </>
          ) : (
            <>
              <p className="text-slate">Worker profiles are hidden until you renew. Your bookings and favourites are safe.</p>
              <Link href="/client/access" className="self-start rounded-xl bg-gold px-4 py-3 font-bold text-ink no-underline">Renew for ₹9</Link>
            </>
          )}
        </Section>
      </div>
      <Section title="Payment history"><PaymentsHistory /></Section>
      <p className="text-sm text-muted">Charged twice or money deducted on a failed payment? <Link href="/client/report">Raise a payment issue</Link>. Job payments to workers are made directly and are not shown here.</p>
    </>
  );
}
