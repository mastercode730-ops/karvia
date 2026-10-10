'use client';

import { WorkerShell } from '@/components/shells';
import { NotificationsList } from '@/components/shared-pages';

export default function WorkerNotifications() {
  return (
    <WorkerShell>
      <NotificationsList />
    </WorkerShell>
  );
}
