'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PublicPage } from '@/components/shells';
import { Icon } from '@/components/ui';

const POPULAR = [
  ['Plumber', 'Per visit · per hour · quote'],
  ['Electrician', 'Per visit · per job'],
  ['Driver', 'Per hour · per day · outstation quote'],
  ['Maid', 'Per day · monthly'],
  ['Labour', 'Per day · per person'],
  ['Painter', 'Per day · per job · quote'],
  ['DJ & events', 'Package · quote'],
  ['Office staff', 'Salary · work history'],
];

export default function Home() {
  const [role, setRole] = useState<'client' | 'worker'>('client');
  const tab = (r: 'client' | 'worker') =>
    `rounded-[9px] px-4 py-2.5 text-[15px] font-semibold ${role === r ? 'bg-ink text-white' : 'text-slate'}`;
  return (
    <PublicPage>
      <section className="bg-canvas">
        <div className="container-page flex flex-wrap items-center gap-12 py-16 lg:py-20">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5">
            <div className="flex w-max max-w-full gap-1.5 rounded-xl border border-line bg-white p-1" role="tablist">
              <button role="tab" aria-selected={role === 'client'} className={tab('client')} onClick={() => setRole('client')}>Kaam karwao · I need a worker</button>
              <button role="tab" aria-selected={role === 'worker'} className={tab('worker')} onClick={() => setRole('worker')}>Kaam pao · I want work</button>
            </div>
            {role === 'client' ? (
              <>
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">Verified local workers, <span className="text-brand">within 5 KM</span> of your job.</h1>
                <p className="max-w-[56ch] text-xl leading-relaxed text-slate">Plumber, driver, electrician, maid, labour, DJ and more. Pay ₹9 once for 30 days of access, see real profiles and prices, and send a request. The first verified worker to accept gets your job.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/login?as=client" className="rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-white no-underline">Find a worker near me</Link>
                  <Link href="/how-it-works" className="rounded-xl border border-line-strong px-5 py-4 text-lg font-semibold text-ink no-underline">See how it works</Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">Get job requests from clients <span className="text-brand">near you</span>.</h1>
                <p className="max-w-[56ch] text-xl leading-relaxed text-slate">Register with your mobile number. Save and finish your profile any time. After verification, start with a free trial, then ₹199 for 30 days. No commission on your work.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/login?as=worker" className="rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-white no-underline">Register as a worker</Link>
                  <Link href="/become-worker" className="rounded-xl border border-line-strong px-5 py-4 text-lg font-semibold text-ink no-underline">Plans and rules</Link>
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate">
              <span className="flex items-center gap-1.5">{Icon.shield('#0B6E4F')}Admin-verified workers only</span>
              <span className="flex items-center gap-1.5">{Icon.clock('#0B6E4F')}60-second accept window</span>
              <span className="flex items-center gap-1.5">{Icon.lock('#0B6E4F')}No auto-renewal</span>
            </div>
          </div>

          <div className="card flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-6 shadow-[0_20px_40px_-24px_rgba(19,33,60,.25)]">
            <h2 className="text-2xl font-bold">What do you need done?</h2>
            <div className="grid grid-cols-3 gap-2">
              {['Plumber', 'Electrician', 'Driver', 'Maid', 'Labour', 'Painter'].map((c) => (
                <Link key={c} href="/categories" className="rounded-xl border border-line px-2 py-3 text-center font-medium text-ink no-underline hover:border-brand">{c}</Link>
              ))}
            </div>
            <div className="flex items-start gap-2.5 rounded-xl bg-gold-tint p-3.5">
              <span className="rounded-lg bg-gold px-2.5 py-1 font-display text-lg font-extrabold">₹9</span>
              <p className="leading-snug">One payment unlocks <b>30 days</b> of worker profiles, prices and requests. No charge per worker or per request.</p>
            </div>
            <Link href="/login?as=client" className="rounded-xl bg-ink py-4 text-center text-[17px] font-semibold text-white no-underline">Continue with mobile number</Link>
          </div>
        </div>
      </section>

      <section className="container-page flex flex-col gap-7 py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-4xl font-extrabold">Popular categories</h2>
          <Link href="/categories" className="font-semibold text-brand">All categories →</Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">
          {POPULAR.map(([name, models]) => (
            <Link key={name} href="/categories" className="flex flex-col gap-1.5 rounded-xl border border-line p-5 text-ink no-underline hover:border-brand">
              <b className="font-display text-xl">{name}</b>
              <span className="text-sm text-muted">{models}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="container-page flex flex-col gap-8 py-16">
          <h2 className="text-4xl font-extrabold">From request to worker in four steps</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {[
              ['Login with OTP', 'Mobile number, OTP, your name and location. Nothing else.'],
              ['Unlock for ₹9', '30 days of verified profiles, prices, reviews and requests.'],
              ['Send a request', 'Instant, scheduled, or ask for quotes. Add a photo or a voice note.'],
              ['First to accept gets it', 'Nearby workers get 60 seconds. You get a confirmation and contact.'],
            ].map(([t, b], i) => (
              <div key={t} className="flex flex-col gap-2.5 rounded-2xl border border-[#2E3D5C] p-6">
                <span className="font-display text-4xl font-extrabold text-gold">{i + 1}</span>
                <h3 className="text-[22px] font-bold">{t}</h3>
                <p className="leading-relaxed text-[#C3CCDA]">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page flex flex-wrap gap-6 py-16">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-[20px] bg-brand-tint p-8">
          <span className="eyebrow !text-brand">For clients</span>
          <h2 className="text-3xl font-bold">₹9 for 30 days</h2>
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>See every eligible worker near your job</li>
            <li>Switch between workers as often as you like</li>
            <li>Save favourites and rehire them later</li>
            <li>No hidden auto-renewal. Renew yourself when it ends.</li>
          </ul>
          <Link href="/login?as=client" className="self-start rounded-xl bg-brand px-5 py-3 font-semibold text-white no-underline">Find a worker</Link>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-[20px] bg-gold-tint p-8">
          <span className="eyebrow !text-gold-text">For workers</span>
          <h2 className="text-3xl font-bold">Free trial, then ₹199 / 30 days</h2>
          <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>Get requests only from your category and area</li>
            <li>Set your own price: per visit, hour, day or job</li>
            <li>Turn AVAILABLE on or off any time</li>
            <li>No commission. Client pays you directly.</li>
          </ul>
          <Link href="/become-worker" className="self-start rounded-xl bg-ink px-5 py-3 font-semibold text-white no-underline">Become a worker</Link>
        </div>
      </section>

      <section className="bg-canvas">
        <div className="container-page flex flex-wrap items-center gap-8 py-16">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
            <h2 className="text-4xl font-bold">Why people trust Karvia</h2>
            <p className="text-lg leading-relaxed text-slate">Every worker is checked by our team before they can receive a single request. Their home address and documents are never shown publicly.</p>
          </div>
          <div className="grid min-w-0 flex-[1_1_520px] grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['Admin verification', 'Documents reviewed before going live'],
              ['Real reviews only', 'Only after a completed booking'],
              ['Price locked', 'Agreed amount never changes silently'],
              ['Report button', 'No-show, overcharging, misconduct'],
            ].map(([t, b]) => (
              <div key={t} className="card p-4"><b>{t}</b><p className="mt-1 text-[15px] text-muted">{b}</p></div>
            ))}
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
