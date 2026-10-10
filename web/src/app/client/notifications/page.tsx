'use client';

import { ClientShell } from '@/components/shells';
import { NotificationsList } from '@/components/shared-pages';

export default function Notifications() {
  return (
    <ClientShell>
      <NotificationsList />
    </ClientShell>
  );
}
