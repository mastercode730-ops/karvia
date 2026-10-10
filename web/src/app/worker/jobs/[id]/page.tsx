'use client';

import { useParams } from 'next/navigation';
import { BookingView } from '@/components/booking-view';
import { WorkerShell } from '@/components/shells';

export default function WorkerJob() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkerShell>
      <BookingView id={id} role="WORKER" />
    </WorkerShell>
  );
}
