import Link from 'next/link';
import { PublicPage } from '@/components/shells';

export const metadata = { title: 'Help & support' };

const TOPICS: [string, string[]][] = [
  ['Login & OTP', ['OTP not received? Wait 30 seconds and tap Resend. You can request 5 OTPs per hour.', 'Changing your mobile number needs our support team.', 'Add or remove your email from Profile.']],
  ['₹9 access', ['Paid but access not active? It unlocks only after the bank confirms. This usually takes under a minute.', 'Charged twice? Raise a report; duplicates are reviewed with the payment provider.', 'Access lasts 30 days and does not renew by itself.']],
  ['Requests & bookings', ['No worker accepted? Try a wider area, another time, or pick a worker yourself.', 'Cancel from the booking page. Late cancellations are recorded.', 'Extra charges need your approval in the app first.']],
  ['Workers', ['Verification usually takes 24–48 hours after you submit.', 'Trial is 5 days, then ₹199 for 30 days. Nothing is charged automatically.', 'Not getting requests? Check: verified, plan active, AVAILABLE on, services and area set.']],
  ['Safety & reports', ['Use the Report button on any booking.', 'Add payment proof, photos or documents as evidence.', 'Karvia can warn, suspend or block accounts.']],
  ['Privacy', ['Exact addresses and documents are never shown publicly.', 'Ask for your data or account deletion from Profile.', 'Offers and news are optional and can be turned off.']],
];

export default function Help() {
  return (
    <PublicPage>
      <section className="bg-canvas">
        <div className="container-page flex flex-col items-center gap-3 py-14 text-center">
          <h1 className="text-5xl font-extrabold">How can we help?</h1>
          <p className="max-w-[60ch] text-lg text-slate">Answers to common questions. Logged-in users can raise a report and track it in their account.</p>
        </div>
      </section>
      <section className="container-page grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 py-12">
        {TOPICS.map(([t, items]) => (
          <div key={t} className="card flex flex-col gap-2.5 p-6">
            <h2 className="text-[22px] font-bold">{t}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-slate">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ))}
      </section>
      <section className="container-page pb-16">
        <div className="flex flex-col gap-3 rounded-2xl bg-ink p-7 text-white">
          <h2 className="text-2xl font-bold">Still need help?</h2>
          <p className="text-[#C3CCDA]">Log in and use “Report a problem”. Support hours: [Mon–Sat, 9am–7pm] · [+91 XXXXX XXXXX]</p>
          <Link href="/login?as=client&next=%2Fclient%2Freport" className="self-start rounded-xl bg-gold px-5 py-3 font-bold text-ink no-underline">Raise a ticket</Link>
        </div>
      </section>
    </PublicPage>
  );
}
