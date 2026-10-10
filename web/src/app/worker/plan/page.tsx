'use client';

import { date, rupees } from '@karvia/shared';
import { WorkerShell } from '@/components/shells';
import { PaymentsHistory } from '@/components/shared-pages';
import { Loading, Pill, Section } from '@/components/ui';
import { PayButton } from '@/components/widgets';
import { useApi, useSession } from '@/lib/session';

export default function Plan() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { user } = useSession();
  const me = useApi<any>('/worker/me');
  const quote = useApi<any>('/payments/quote/WORKER_PLAN');
  if (me.loading || quote.loading || !me.data || !quote.data) return <Loading />;
  const w = me.data;
  const plan = w.plan;
  const q = quote.data;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <h1 className="text-4xl font-extrabold">My plan</h1>
      <div className="flex flex-wrap gap-4">
        <Section className={`flex-[1_1_420px] ${plan?.daysLeft <= 3 ? '!border-2 !border-gold' : ''}`} title={plan ? (plan.kind === 'WORKER_TRIAL' ? 'Free trial' : 'Karvia Pro') : 'No active plan'} action={plan ? <Pill tone={plan.daysLeft <= 3 ? 'amber' : 'green'}>Active · {plan.daysLeft} days left</Pill> : <Pill status="EXPIRED">Expired</Pill>}>
          {plan ? (
            <>
              <div className="flex flex-wrap gap-7"><div><span className="text-[13px] text-muted">Started</span><b className="block">{date(plan.startsAt)}</b></div><div><span className="text-[13px] text-muted">Ends</span><b className="block">{date(plan.endsAt)}</b></div></div>
              <p className="text-sm text-muted">{plan.source === 'ADMIN' ? 'Extended by Karvia. ' : ''}When it ends you stop getting new requests. Nothing is charged automatically.</p>
            </>
          ) : (
            <p className="text-slate">You can still log in, edit your profile and see past jobs. New requests stop until you renew.</p>
          )}
        </Section>
        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-2xl bg-ink p-6 text-white">
          <span className="text-[13px] font-bold tracking-wide text-gold">KARVIA PRO</span>
          <b className="font-display text-5xl font-extrabold leading-none">{rupees(q.amountPaise)} <span className="font-sans text-lg font-medium text-[#C3CCDA]">/ {q.days} days</span></b>
          <ul className="list-disc space-y-1 pl-5 text-[#E6EBF2]"><li>Requests from your area and category</li><li>No commission on jobs</li><li>Manual renewal only</li></ul>
          {q.taxPercent != null && <p className="text-sm text-[#C3CCDA]">Includes tax {rupees(q.taxPaise)} · Total {rupees(q.totalPaise)}</p>}
          {w.verificationStatus === 'VERIFIED' ? (
            <PayButton purpose="WORKER_PLAN" label={`Pay ${rupees(q.totalPaise)}${plan ? ' to add 30 days' : ''}`} phone={user?.phone} onPaid={() => me.reload()} />
          ) : (
            <p className="rounded-xl bg-ink-2 p-3 text-sm">The plan is available after Karvia verifies your profile. Your free trial starts automatically on approval.</p>
          )}
        </section>
      </div>
      <Section title="Payment history"><PaymentsHistory /></Section>
    </div>
  );
}
