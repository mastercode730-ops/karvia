'use client';

import { WorkerShell } from '@/components/shells';
import { Loading, Section } from '@/components/ui';
import { BasicsForm, ExperienceForm, HistoryForm, WorkPhotosForm } from '@/components/worker-forms';
import { useApi, useSession } from '@/lib/session';

export default function WorkerProfilePage() {
  return (
    <WorkerShell>
      <Inner />
    </WorkerShell>
  );
}

function Inner() {
  const { data: w, loading, setData } = useApi<any>('/worker/me');
  const { logout } = useSession();
  if (loading || !w) return <Loading />;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <h1 className="text-4xl font-extrabold">My professional profile</h1>
      {w.verificationStatus === 'VERIFIED' && <p className="rounded-xl bg-gold-tint px-4 py-3 text-[15px]">Changing your name, photo or services sends your profile back to Karvia for a quick review before clients see the change.</p>}
      <Section title="Name & photo"><BasicsForm w={w} onSaved={setData} /></Section>
      <Section title="Experience, skills & languages"><ExperienceForm w={w} onSaved={setData} /></Section>
      <Section title="Work photos"><WorkPhotosForm w={w} onSaved={setData} /></Section>
      <Section title="Employment / work history"><HistoryForm w={w} onSaved={setData} /></Section>
      <button className="self-start rounded-xl bg-ink px-4 py-3 font-semibold text-white" onClick={logout}>Log out</button>
    </div>
  );
}
