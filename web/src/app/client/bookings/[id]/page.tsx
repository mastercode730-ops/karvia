'use client';

import { useParams } from 'next/navigation';
import { BookingView } from '@/components/booking-view';
import { ClientShell } from '@/components/shells';

export default function ClientBooking() {
  const { id } = useParams<{ id: string }>();
  return (
    <ClientShell>
      <BookingView id={id} role="CLIENT" />
    </ClientShell>
  );
}
