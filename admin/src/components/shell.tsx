'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useStaff } from '@/lib/session';
import { Button, Field, Loading } from './ui';

const NAV: { href: string; label: string; perm?: string; section?: string; roles?: string[] }[] = [
  { href: '/', label: 'Dashboard', roles: ['ADMIN', 'SUBADMIN'] },
  { href: '/verification', label: 'Verification', perm: 'workers.view' },
  { href: '/clients', label: 'Clients', perm: 'clients.view' },
  { href: '/requests', label: 'Requests & bookings', perm: 'bookings.view' },
  { href: '/payments', label: 'Payments & plans', perm: 'payments.view' },
  { href: '/complaints', label: 'Complaints', perm: 'complaints.view' },
  { href: '/leads', label: 'Leads', perm: 'leads.view' },
  { href: '/telecaller', label: 'Telecaller console', roles: ['TELECALLER', 'ADMIN'] },
  { href: '/reports', label: 'Reports', perm: 'reports.view' },
  { href: '/categories', label: 'Categories', perm: 'categories.edit', section: 'Configuration' },
  { href: '/matching', label: 'Matching rules', perm: 'bookings.view' },
  { href: '/settings', label: 'Business settings', roles: ['ADMIN', 'SUBADMIN'] },
  { href: '/staff', label: 'Roles & staff', perm: 'staff.manage' },
  { href: '/audit', label: 'Audit log', perm: 'audit.view' },
];

export function Shell({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  const { user, ready, can, logout } = useStaff();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (!ready || !user || user.mfaPending) return <div className="p-8"><Loading /></div>;
  const items = NAV.filter((n) => (n.roles ? n.roles.includes(user.activeRole) : true) && (n.perm ? can(n.perm) : true));
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <div className="flex min-h-screen flex-wrap">
      <nav aria-label="Admin" className={`w-full shrink-0 bg-ink-admin px-3 py-4 text-sm lg:block lg:min-h-screen lg:w-60 ${open ? 'block' : 'hidden'}`}>
        <div className="flex items-center gap-2 px-2 pb-4 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-display text-lg font-extrabold">K</span>
          <span className="font-display text-xl font-extrabold">karvia</span>
          <span className="rounded bg-ink-2 px-1.5 py-0.5 text-[11px] font-bold text-[#8FD3BA]">{user.activeRole}</span>
        </div>
        {items.map((n) => (
          <div key={n.href}>
            {n.section && <span className="block px-3 pb-1 pt-4 text-[11px] font-bold tracking-widest text-[#7D8AA3]">{n.section.toUpperCase()}</span>}
            <Link href={n.href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 no-underline ${active(n.href) ? 'bg-ink-2 font-bold text-white' : 'text-[#C3CCDA] hover:text-white'}`}>{n.label}</Link>
          </div>
        ))}
        <div className="mt-6 border-t border-ink-2 px-3 pt-4 text-[#C3CCDA]">
          <p className="truncate">{user.name ?? user.phone}</p>
          <button onClick={logout} className="mt-2 font-semibold text-white">Log out</button>
        </div>
      </nav>
      <main className="min-w-0 flex-[999_1_560px] px-4 py-6 sm:px-7">
        <button className="mb-3 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>☰ Menu</button>
        {(title || actions) && (
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            {title && <h1 className="text-3xl font-extrabold">{title}</h1>}
            {actions}
          </div>
        )}
        <div className="flex flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}

/** Table with consistent spacing; wide tables scroll inside their own box. */
export function Table({ head, children, minWidth = 860 }: { head: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead><tr className="text-left text-xs uppercase tracking-wide text-muted">{head.map((h, i) => <th key={i} className="border-b border-line px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`border-b border-line px-4 py-3 align-middle ${className}`}>{children}</td>;

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted">
      <span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span>
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

/** Inline "reason required" confirmation used for every sensitive action (also written to the audit log). */
export function ReasonAction({ label, variant = 'secondary', onConfirm, placeholder = 'Reason (saved to audit log)' }: { label: string; variant?: 'primary' | 'secondary' | 'danger' | 'dark'; onConfirm: (reason: string) => Promise<void>; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <Button size="sm" variant={variant} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <form className="flex w-full flex-col gap-2 rounded-xl bg-canvas p-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onConfirm(reason); setOpen(false); setReason(''); } finally { setBusy(false); } }}>
      <Field label={label} htmlFor={`r-${label}`}><input id={`r-${label}`} autoFocus className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} /></Field>
      <div className="flex gap-2"><Button type="submit" size="sm" variant={variant === 'secondary' ? 'dark' : variant} loading={busy} disabled={reason.trim().length < 3}>Confirm</Button><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
    </form>
  );
}
