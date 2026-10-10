import Link from 'next/link';
import { PublicPage } from '@/components/shells';

export const metadata = { title: 'How Karvia works' };

const CLIENT_STEPS = [
  ['Mobile + OTP', 'Add your name and location by GPS, area or pincode. Email is optional.'],
  ['Pay ₹9 for 30 days', 'Access unlocks only after the payment is confirmed. No refund after activation, no auto-renewal.'],
  ['Choose a service', 'Category, then service. See workers within 5 KM with experience, skills, price, rating and availability.'],
  ['Send a request', 'Pick instant, scheduled or quote. Describe the work in text or voice, add a photo.'],
  ['First to accept wins', 'Nearby workers have 60 seconds. The first to accept is locked in; others see "already assigned".'],
  ['Job, then review', 'Pay the worker directly. Rate them, save them as a favourite, or report a problem.'],
];
const FLOW = ['Requested', 'Searching within 5 KM', 'Sent to eligible workers', 'Accepted & locked', 'Confirmed', 'In progress', 'Completed'];
const WORKER = [
  ['Register', 'Mobile + OTP. Save anytime.'],
  ['Profile', 'Skills, price, photos, history'],
  ['Documents', 'Kept private'],
  ['Verified', 'By Karvia admin'],
  ['Free trial', 'Then ₹199 / 30 days'],
  ['AVAILABLE on', 'Start receiving requests'],
];
const UNLOCK = [
  ['Before ₹9 payment', 'Categories only. No profiles, prices or contact.'],
  ['After ₹9 payment', 'Full worker profiles, prices, reviews. Follow and favourite.'],
  ['After you send a request', 'Updates about that request in the app.'],
  ['After the worker accepts', 'Phone contact for that booking. Exact address is never public.'],
];

export default function HowItWorks() {
  return (
    <PublicPage>
      <section className="bg-canvas">
        <div className="container-page flex flex-col gap-3.5 py-16">
          <span className="eyebrow !text-brand">How Karvia works</span>
          <h1 className="max-w-[18ch] text-5xl font-extrabold">Simple for you. The hard work happens behind the screen.</h1>
          <p className="max-w-[60ch] text-lg leading-relaxed text-slate">You never need to understand matching, verification or subscriptions. Pick what you need and where. Karvia finds the right verified worker nearby.</p>
        </div>
      </section>
      <section className="container-page flex flex-col gap-5 py-14">
        <h2 className="text-3xl font-bold">If you need a worker</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
          {CLIENT_STEPS.map(([t, b], i) => (
            <div key={t} className="card flex flex-col gap-2 p-6">
              <span className="font-display text-sm font-extrabold text-brand">STEP {i + 1}</span>
              <h3 className="text-[22px] font-bold">{t}</h3>
              <p className="leading-relaxed text-slate">{b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-ink">
        <div className="container-page flex flex-col gap-5 py-14">
          <h2 className="text-3xl font-bold text-white">What happens after you tap “Send request”</h2>
          <ol className="flex flex-wrap items-center gap-2.5 font-semibold text-white">
            {FLOW.map((s, i) => (
              <li key={s} className="flex items-center gap-2.5">
                <span className={`rounded-xl px-3.5 py-2.5 ${i === 3 ? 'bg-brand' : 'bg-ink-2'}`}>{s}</span>
                {i < FLOW.length - 1 && <span aria-hidden className="text-[#8D9AB0]">→</span>}
              </li>
            ))}
          </ol>
          <p className="max-w-[70ch] leading-relaxed text-[#C3CCDA]">If nobody accepts in time you’ll see “No worker accepted yet. Aapki search jaari hai, suitable worker milte hi notify kiya jayega.” The search area can grow from 5 to 10 to 15 KM.</p>
        </div>
      </section>
      <section className="container-page flex flex-col gap-5 py-14">
        <h2 className="text-3xl font-bold">If you want work</h2>
        <div className="flex flex-wrap gap-2.5">
          {WORKER.map(([t, b], i) => (
            <div key={t} className={`min-w-[150px] flex-1 rounded-xl p-4 ${i < 3 ? 'bg-gold-tint' : 'bg-brand-tint'}`}><b>{t}</b><p className="mt-1 text-sm text-slate">{b}</p></div>
          ))}
        </div>
      </section>
      <section className="bg-canvas">
        <div className="container-page flex flex-col gap-4 py-14">
          <h2 className="text-3xl font-bold">When does contact unlock?</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr className="bg-canvas text-left"><th className="px-5 py-3.5">Stage</th><th className="px-5 py-3.5">What you can see</th></tr></thead>
              <tbody>
                {UNLOCK.map(([a, b]) => (
                  <tr key={a}><td className="border-t border-line px-5 py-3.5 font-semibold">{a}</td><td className="border-t border-line px-5 py-3.5">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/login?as=client" className="self-start rounded-xl bg-brand px-6 py-4 text-[17px] font-semibold text-white no-underline">Find a worker near me</Link>
        </div>
      </section>
    </PublicPage>
  );
}
