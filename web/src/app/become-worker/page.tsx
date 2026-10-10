import Link from 'next/link';
import { PublicPage } from '@/components/shells';

export const metadata = { title: 'Become a worker' };

const CONDITIONS = ['Karvia has verified you', 'Your trial or plan is active', 'You are switched to AVAILABLE', 'The job matches your service', 'The job is within 5 KM of you', 'You are free at that date and time'];
const PATH = [
  ['Mobile + OTP', 'No password'],
  ['Basic profile', 'Name, photo, service, area, experience'],
  ['Price & skills', 'Per visit, hour, day or job'],
  ['Documents', 'Private, never shown publicly'],
  ['Verification', 'Karvia team reviews'],
  ['Go AVAILABLE', 'Requests start coming'],
];
const FAQ = [
  ['Does Karvia take a cut from my job?', 'No. The client pays you directly. You only pay the ₹199 monthly plan after your free trial.'],
  ['What if my plan expires?', 'You can still log in, edit your profile and see past jobs. New requests stop until you renew.'],
  ['Will clients see my home address?', 'Never. Matching uses the job location. Your address and documents stay private.'],
  ['Do I need to fill a weekly calendar?', 'No. One switch: AVAILABLE or BUSY. You can block specific dates if you want.'],
];

export default function BecomeWorker() {
  return (
    <PublicPage>
      <section className="bg-gold-tint">
        <div className="container-page flex flex-wrap items-center gap-10 py-16">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4">
            <span className="eyebrow !text-gold-text">Kaam pao · For workers</span>
            <h1 className="text-5xl font-extrabold">Get work from clients in your own area.</h1>
            <p className="max-w-[54ch] text-lg leading-relaxed text-slate">Plumbers, electricians, drivers, maids, labourers, painters, DJs, office staff. Register in 2 minutes with your mobile. You can finish your profile later; nothing you enter is lost.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login?as=worker" className="rounded-xl bg-ink px-6 py-4 text-lg font-semibold text-white no-underline">Start registration</Link>
              <a href="#plans" className="rounded-xl border border-[#D9B66A] px-5 py-4 text-lg font-semibold text-ink no-underline">See plans</a>
            </div>
          </div>
          <div className="card flex min-w-0 flex-[1_1_360px] flex-col gap-3 border-gold-line p-6">
            <b className="font-display text-xl">You receive a request when:</b>
            {CONDITIONS.map((c) => (
              <div key={c} className="flex items-center gap-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand">✓</span>{c}</div>
            ))}
          </div>
        </div>
      </section>
      <section id="plans" className="container-page flex flex-col gap-6 py-16">
        <h2 className="text-4xl font-bold">Plans</h2>
        <div className="flex flex-wrap gap-4">
          <div className="card flex min-w-[300px] flex-1 flex-col gap-3 p-7">
            <span className="font-semibold text-muted">After approval</span>
            <h3 className="text-3xl font-bold">Free trial</h3>
            <p className="font-display text-5xl font-extrabold">₹0 <span className="font-sans text-lg font-medium text-muted">for 5 days</span></p>
            <ul className="list-disc space-y-1 pl-5 text-slate"><li>One trial per mobile number</li><li>Reminder before it ends</li><li>Does not turn into a paid plan by itself</li></ul>
          </div>
          <div className="relative flex min-w-[300px] flex-1 flex-col gap-3 rounded-2xl border-2 border-brand bg-white p-7">
            <span className="absolute -top-3.5 left-6 rounded-full bg-brand px-3 py-0.5 text-sm font-semibold text-white">Monthly</span>
            <span className="font-semibold text-muted">Worker plan</span>
            <h3 className="text-3xl font-bold">Karvia Pro</h3>
            <p className="font-display text-5xl font-extrabold">₹199 <span className="font-sans text-lg font-medium text-muted">/ 30 days</span></p>
            <ul className="list-disc space-y-1 pl-5 text-slate"><li>Requests from your area and category</li><li>No commission on your jobs</li><li>You renew yourself. No auto-charge.</li><li>History stays even after expiry</li></ul>
            <Link href="/login?as=worker" className="mt-1 rounded-xl bg-brand py-3.5 text-center font-semibold text-white no-underline">Register now</Link>
          </div>
        </div>
      </section>
      <section className="bg-canvas">
        <div className="container-page flex flex-col gap-6 py-16">
          <h2 className="text-4xl font-bold">Your path to the first job</h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {PATH.map(([t, b], i) => (
              <li key={t} className="card flex flex-col gap-1.5 p-4"><span className="font-display text-3xl font-extrabold text-brand">{i + 1}</span><b>{t}</b><p className="text-sm text-muted">{b}</p></li>
            ))}
          </ol>
          <p className="card p-4">Stuck halfway? Our team will call you and help finish your profile.</p>
        </div>
      </section>
      <section className="container-page flex flex-col gap-4 py-16">
        <h2 className="text-4xl font-bold">Questions workers ask</h2>
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0} className="card px-5 py-4">
            <summary className="cursor-pointer text-lg font-semibold">{q}</summary>
            <p className="mt-2 leading-relaxed text-slate">{a}</p>
          </details>
        ))}
      </section>
    </PublicPage>
  );
}
