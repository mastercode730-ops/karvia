'use client';

import { rupees } from '@karvia/shared';
import { useRef, useState } from 'react';
import { api, errMsg } from '@/lib/session';
import { Button, ErrorBox, Icon } from './ui';

export interface Picked {
  lat: number;
  lng: number;
  area: string;
  pincode?: string;
  label?: string;
}

/** GPS first; address search when the server has a maps key; a demo location for local testing. */
export function LocationPicker({ value, onChange }: { value: Picked | null; onChange: (p: Picked) => void }) {
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const gps = () => {
    setError(null);
    if (!navigator.geolocation) return setError('Location is not available on this device. Search your area instead.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let area = 'Current location';
        let pincode: string | undefined;
        try {
          const r = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`);
          if (r[0]) {
            area = r[0].area ?? r[0].label;
            pincode = r[0].pincode ?? undefined;
          }
        } catch {
          /* address lookup is optional */
        }
        onChange({ lat, lng, area, pincode });
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError('We could not get your location. Allow location access or search your area.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const search = async () => {
    setError(null);
    setBusy(true);
    try {
      setResults(await api.get(`/geo/search?q=${encodeURIComponent(q)}`));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" onClick={gps} loading={busy} className="!border-2 !border-brand !bg-brand-tint !text-brand">
        {Icon.pin('#0B6E4F')} Use my current location (GPS)
      </Button>
      <div className="flex items-center gap-2.5 text-sm text-muted"><span className="h-px flex-1 bg-line" />or search your area<span className="h-px flex-1 bg-line" /></div>
      <div className="flex gap-2">
        <label htmlFor="loc-q" className="sr-only">Area, street or pincode</label>
        <input id="loc-q" className="input" placeholder="Area, street or pincode" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())} />
        <Button type="button" variant="dark" onClick={search} disabled={q.trim().length < 3}>Search</Button>
      </div>
      {results.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="w-full border-b border-line px-3.5 py-3 text-left last:border-0 hover:bg-canvas" onClick={() => { onChange({ lat: r.lat, lng: r.lng, area: r.area ?? r.label, pincode: r.pincode ?? undefined, label: r.label }); setResults([]); }}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
      {process.env.NODE_ENV !== 'production' && (
        <button type="button" className="self-start text-sm font-semibold text-brand" onClick={() => onChange({ lat: 28.6208, lng: 77.3633, area: 'Sector 62, Noida', pincode: '201309' })}>
          Use demo location (Sector 62, Noida)
        </button>
      )}
      {error && <ErrorBox message={error} />}
      {value && (
        <div className="flex items-center gap-2.5 rounded-xl bg-canvas px-3.5 py-3">
          {Icon.pin('#0B6E4F')}
          <span><b>{value.area}</b>{value.pincode ? ` · ${value.pincode}` : ''} <span className="text-sm text-muted">({value.lat.toFixed(4)}, {value.lng.toFixed(4)})</span></span>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

/**
 * Starts a payment. Access is granted only by the server after it verifies the payment
 * (Razorpay signature / webhook), never by this page.
 */
export function PayButton({ purpose, label, onPaid, phone }: { purpose: 'CLIENT_ACCESS' | 'WORKER_PLAN'; label: string; onPaid: () => void; phone?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mockOrder, setMockOrder] = useState<any>(null);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const order = await api.post('/payments/orders', { purpose });
      if (order.provider === 'mock') {
        setMockOrder(order);
        setBusy(false);
        return;
      }
      await loadRazorpay();
      const rz = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.totalPaise,
        currency: 'INR',
        name: 'Karvia',
        description: purpose === 'CLIENT_ACCESS' ? '30-day client access' : 'Worker plan · 30 days',
        prefill: phone ? { contact: phone } : undefined,
        theme: { color: '#0B6E4F' },
        handler: async (r: any) => {
          try {
            await api.post('/payments/razorpay/verify', { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            onPaid();
          } catch (e) {
            setError(`${errMsg(e)} If money was deducted, access will unlock as soon as the bank confirms.`);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on('payment.failed', () => {
        setError('Payment did not go through. No access was unlocked. Please try again.');
        setBusy(false);
      });
      rz.open();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  const mock = async (outcome: 'success' | 'failed') => {
    setBusy(true);
    try {
      const p = await api.post(`/payments/mock/${mockOrder.orderId}/complete`, { outcome });
      setMockOrder(null);
      if (p.status === 'SUCCESS') onPaid();
      else setError('Payment failed. No access was unlocked.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!mockOrder && <Button size="lg" onClick={start} loading={busy}>{label}</Button>}
      {mockOrder && (
        <div className="flex flex-col gap-2.5 rounded-xl border-2 border-dashed border-gold bg-gold-tint p-4">
          <b>Test payment of {rupees(mockOrder.totalPaise)}</b>
          <p className="text-sm text-gold-text">Razorpay keys are not set yet, so this is a simulated payment for testing.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => mock('success')} loading={busy}>Simulate success</Button>
            <Button variant="danger" onClick={() => mock('failed')} disabled={busy}>Simulate failure</Button>
          </div>
        </div>
      )}
      {error && <ErrorBox message={error} />}
    </div>
  );
}

/** Upload one file of a given kind; shows the real error the server returns (type, size). */
export function FileButton({ kind, accept, label, onUploaded, small }: { kind: string; accept: string; label: string; onUploaded: (f: { id: string; url: string; name: string | null }) => void; small?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) return setError('File is larger than 10 MB');
        setError(null);
        setBusy(true);
        try {
          onUploaded(await api.upload(kind, f));
        } catch (err) {
          setError(errMsg(err));
        } finally {
          setBusy(false);
        }
      }} />
      <Button type="button" variant="secondary" size={small ? 'sm' : 'md'} loading={busy} onClick={() => ref.current?.click()}>{label}</Button>
      {error && <span className="text-sm text-alert-text">{error}</span>}
    </div>
  );
}
