const IST = 'Asia/Kolkata';

export const rupees = (paise: number | null | undefined) =>
  paise == null ? '—' : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0 })}`;

export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '—';

export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST }) : '—';

export const time = (d: string | Date) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });

export function ago(d: string | Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return date(d);
}

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const PRICING_LABEL: Record<string, string> = {
  PER_HOUR: 'Per hour', PER_VISIT: 'Per visit', PER_DAY: 'Per day', PER_JOB: 'Per job', PER_KM: 'Per KM',
  PER_PERSON: 'Per person', PER_ITEM: 'Per item', PACKAGE: 'Package', CUSTOM_QUOTE: 'Custom quote',
};
export const BOOKING_TYPE_LABEL: Record<string, string> = { INSTANT: 'Instant', SCHEDULED: 'Scheduled', QUOTE: 'Request quote' };
export const DOC_LABEL: Record<string, string> = {
  AADHAAR: 'Aadhaar card', PAN: 'PAN card', ADDRESS_PROOF: 'Address proof', POLICE_VERIFICATION: 'Police verification',
  DRIVING_LICENCE: 'Driving licence', SKILL_CERTIFICATE: 'Skill certificate', RESUME: 'Resume / biodata', OTHER: 'Other document',
};
export const COMPLAINT_LABEL: Record<string, string> = {
  WORKER_DID_NOT_ARRIVE: 'Worker did not arrive', ACCEPTED_BUT_CANCELLED: 'Accepted but cancelled', PAYMENT_DISPUTE: 'Payment dispute',
  OVERCHARGING: 'Overcharging', MISLEADING_PRICE: 'Misleading price', POOR_SERVICE: 'Poor / wrong service', FAKE_PROFILE: 'Fake profile / info',
  FAKE_DOCUMENTS: 'Fake documents', MISCONDUCT: 'Misconduct / harassment', FRAUD: 'Fraud', UNSAFE: 'Unsafe behaviour / location',
  ILLEGAL_SERVICE: 'Illegal service', CLIENT_DID_NOT_PAY: 'Client did not pay', OTHER: 'Other',
};

/** Tone for status pills: one place so every screen colours a status the same way. */
export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'grey' | 'dark';
export const STATUS_TONE: Record<string, Tone> = {
  SEARCHING: 'amber', SENT: 'amber', QUOTING: 'blue', ACCEPTED: 'green', NO_WORKER: 'grey', CANCELLED: 'red', EXPIRED: 'grey',
  CONFIRMED: 'blue', IN_PROGRESS: 'green', COMPLETED: 'grey', DISPUTED: 'dark',
  INCOMPLETE: 'grey', PENDING: 'amber', UNDER_REVIEW: 'amber', VERIFIED: 'green', REJECTED: 'red', SUSPENDED: 'dark',
  SUCCESS: 'green', FAILED: 'red', CREATED: 'grey', REFUNDED: 'blue', OPEN: 'red', RESOLVED: 'green',
  ACTIVE: 'green', WARNED: 'amber', BLOCKED: 'dark', AVAILABLE: 'green', BUSY: 'grey',
  NEW: 'grey', CONTACTED: 'blue', INTERESTED: 'green', REGISTRATION_PENDING: 'amber', PAYMENT_PENDING: 'amber',
  READY_FOR_VERIFICATION: 'blue', FOLLOW_UP: 'amber', CONVERTED: 'green', NOT_INTERESTED: 'grey',
};
export const STATUS_LABEL: Record<string, string> = {
  SENT: 'Searching', NO_WORKER: 'No worker yet', IN_PROGRESS: 'In progress', UNDER_REVIEW: 'Under review', QUOTING: 'Getting quotes',
};
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? titleCase(s);
