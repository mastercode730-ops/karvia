import { PublicPage } from '@/components/shells';

export const metadata = { title: 'Terms & privacy' };

const TERMS = [
  ['Who we are', 'Karvia.services is a marketplace that connects clients with independent local workers. Workers are not Karvia employees.'],
  ['Client access fee', '₹9 gives 30 days of access to eligible worker profiles and requests. Access starts only after the payment is confirmed. It does not renew by itself. Once active, the fee is not refunded except for duplicate or failed transactions.'],
  ['Worker plans', 'Approved workers get one free trial. The paid plan is ₹199 for 30 days. Neither charges automatically.'],
  ['Payments between users', 'Clients pay workers directly for the job. Karvia does not guarantee refunds for these payments, but reviews every complaint with evidence.'],
  ['Cancellations', 'Cancellation reasons and times are recorded. Repeated cancellations or no-shows can lead to warnings or suspension.'],
  ['Prohibited activity', 'Fake profiles or documents, fraud, harassment, unsafe behaviour and illegal services are not allowed.'],
  ['Suspension', 'Karvia may warn, suspend or block accounts that break these terms.'],
];
const PRIVACY = [
  ['What we collect', 'Mobile number, name, location you share, profile and service details, requests, payment status, documents (workers), and basic device and usage data.'],
  ['How we use it', 'To match requests with nearby workers, verify workers, process payments, send transactional messages, prevent fraud and handle reports.'],
  ['What we never show', 'Worker home addresses, exact locations and identity documents are never shown to other users. Phone numbers open only for an accepted booking.'],
  ['Your choices', 'Marketing messages are optional and can be turned off. You can ask for a copy of your data or delete your account from your profile.'],
  ['Retention', '[Retention periods to be confirmed with legal counsel.]'],
];

export default function Legal() {
  return (
    <PublicPage>
      <div className="container-page flex flex-col gap-12 py-12">
        <p className="rounded-xl bg-gold-tint px-4 py-3 text-gold-text">Draft. Final legal text must be reviewed by an Indian legal professional before launch.</p>
        <article className="flex max-w-3xl flex-col gap-6 text-[17px] leading-relaxed">
          <h1 className="text-4xl font-extrabold">Terms of use</h1>
          {TERMS.map(([t, b], i) => (
            <div key={t}><h2 className="mb-1 text-2xl font-bold">{i + 1}. {t}</h2><p>{b}</p></div>
          ))}
        </article>
        <article id="privacy" className="flex max-w-3xl flex-col gap-6 text-[17px] leading-relaxed">
          <h1 className="text-4xl font-extrabold">Privacy policy</h1>
          {PRIVACY.map(([t, b]) => (
            <div key={t}><h2 className="mb-1 text-2xl font-bold">{t}</h2><p>{b}</p></div>
          ))}
        </article>
      </div>
    </PublicPage>
  );
}
