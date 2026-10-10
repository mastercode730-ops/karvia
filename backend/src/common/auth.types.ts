import { Role } from '@prisma/client';

/** Every permission a staff member can hold. ADMIN implicitly has all of them. */
export const PERMISSIONS = [
  'workers.view',
  'workers.edit',
  'workers.verify',
  'documents.view',
  'clients.view',
  'clients.edit',
  'bookings.view',
  'bookings.edit',
  'payments.view',
  'payments.refund',
  'subscriptions.edit',
  'complaints.view',
  'complaints.edit',
  'leads.view',
  'leads.assign',
  'leads.edit',
  'categories.edit',
  'settings.edit',
  'staff.manage',
  'audit.view',
  'reports.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Telecallers only ever get these, scoped to leads assigned to them. */
export const TELECALLER_PERMISSIONS: Permission[] = ['leads.edit'];

export const STAFF_ROLES: Role[] = ['ADMIN', 'SUBADMIN', 'TELECALLER'];

export interface AuthUser {
  id: string;
  role: Role; // the role this session was opened for
  roles: Role[];
  sessionId: string;
  permissions: Permission[];
  /** Staff who have not turned on 2FA yet may only reach the 2FA setup routes. */
  mfaPending: boolean;
}
