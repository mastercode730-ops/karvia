'use client';

import { initials, statusLabel, STATUS_TONE, type Tone } from '@karvia/shared';
import Link from 'next/link';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'dark' | 'gold' | 'secondary' | 'danger' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  dark: 'bg-ink text-white hover:bg-ink-2',
  gold: 'bg-gold text-ink hover:brightness-95 font-bold',
  secondary: 'border border-line-strong bg-white text-ink hover:border-muted',
  danger: 'border border-alert/40 bg-white text-alert-text hover:bg-alert-tint',
  ghost: 'text-brand hover:bg-brand-tint',
};
const SIZE = { sm: 'px-3 py-2 text-sm rounded-lg', md: 'px-4 py-3 text-[15px] rounded-xl', lg: 'px-6 py-4 text-lg rounded-xl' };

export function Button({
  variant = 'primary', size = 'md', loading, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', size = 'md', className = '', children }: { href: string; variant?: Variant; size?: keyof typeof SIZE; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex min-h-[44px] items-center justify-center gap-2 font-semibold no-underline transition ${VARIANT[variant]} ${SIZE[size]} ${className}`}>
      {children}
    </Link>
  );
}

const TONE: Record<Tone, string> = {
  green: 'bg-brand-tint text-brand',
  amber: 'bg-gold-tint text-gold-text',
  blue: 'bg-info-tint text-info',
  red: 'bg-alert-tint text-alert-text',
  grey: 'bg-canvas text-slate',
  dark: 'bg-ink text-white',
};

export function Pill({ status, tone, children }: { status?: string; tone?: Tone; children?: ReactNode }) {
  const t = tone ?? (status ? STATUS_TONE[status] : undefined) ?? 'grey';
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${TONE[t]}`}>{children ?? (status ? statusLabel(status) : '')}</span>;
}

export function Spinner({ small }: { small?: boolean }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`} />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-alert-tint px-4 py-3 text-alert-text" role="alert">
      <span className="flex-1">{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line-strong bg-white p-6">
      <b>{title}</b>
      {body && <p className="text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function Avatar({ name, url, size = 48 }: { name?: string | null; url?: string | null; size?: number }) {
  const s = { width: size, height: size };
  if (url) return <img src={url} alt="" style={s} className="shrink-0 rounded-full object-cover" />;
  return (
    <span style={s} className="flex shrink-0 items-center justify-center rounded-full bg-[#DCE7F5] font-display font-bold text-ink">
      {initials(name)}
    </span>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && !error && <span className="text-sm text-muted">{hint}</span>}
      {error && <span className="text-sm text-alert-text">{error}</span>}
    </div>
  );
}

export function Stars({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <span aria-label={`${value} out of 5`} className="text-[#B7791F]" style={{ fontSize: size, letterSpacing: 2 }}>
      {'★★★★★'.slice(0, Math.round(value))}
      <span className="text-line-strong">{'★★★★★'.slice(Math.round(value))}</span>
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star`} onClick={() => onChange(n)}
          className={`text-4xl leading-none ${n <= value ? 'text-[#B7791F]' : 'text-line-strong'}`}>★</button>
      ))}
    </div>
  );
}

/** Live countdown to an ISO time, e.g. the 60-second accept window. */
export function Countdown({ to, onDone }: { to: string | Date; onDone?: () => void }) {
  const end = new Date(to).getTime();
  const [left, setLeft] = useState(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        onDone?.();
      }
    }, 500);
    return () => clearInterval(t);
  }, [end, onDone]);
  const m = Math.floor(left / 60);
  return <span className="tabular-nums">{m}:{String(left % 60).padStart(2, '0')}</span>;
}

export function Section({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex flex-col gap-3 p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-xl font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toast({ message, tone = 'green', onClose }: { message: string; tone?: 'green' | 'red'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div role="status" className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg ${tone === 'green' ? 'bg-brand' : 'bg-alert'}`}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; tone?: 'green' | 'red' } | null>(null);
  const node = toast ? <Toast {...toast} onClose={() => setToast(null)} /> : null;
  return { node, show: (message: string, tone: 'green' | 'red' = 'green') => setToast({ message, tone }) };
}

export const Icon = {
  pin: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  shield: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  clock: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  bell: (c = 'currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  mic: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /></svg>,
  phone: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
  lock: (c = 'currentColor') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
  camera: (c = 'currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /></svg>,
};
