'use client';

import { Suspense } from 'react';
import { BookingsList } from '@/components/bookings-list';
import { ClientShell } from '@/components/shells';

export default function Bookings() {
  return (
    <ClientShell>
      <Suspense><BookingsList base="/client/bookings" title="My bookings" /></Suspense>
    </ClientShell>
  );
}
