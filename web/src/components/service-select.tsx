'use client';

import { useApi } from '@/lib/session';

/** Category → sub-category → service dropdown from the live catalogue. */
export function ServiceSelect({ value, onChange, id = 'svc' }: { value: string; onChange: (id: string, service?: any) => void; id?: string }) {
  const { data } = useApi<any[]>('/catalog');
  const all = data?.flatMap((c) => c.subCategories.flatMap((s: any) => s.services.map((v: any) => ({ ...v, sub: s.name })))) ?? [];
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value, all.find((v) => v.id === e.target.value))}>
      <option value="">Choose a service…</option>
      {data?.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.subCategories.flatMap((s: any) => s.services.map((v: any) => <option key={v.id} value={v.id}>{s.name} · {v.name}</option>))}
        </optgroup>
      ))}
    </select>
  );
}
