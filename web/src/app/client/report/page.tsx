'use client';

import { Suspense } from 'react';
import { ClientShell } from '@/components/shells';
import { ReportForm } from '@/components/shared-pages';

export default function Report() {
  return (
    <ClientShell>
      <Suspense><ReportForm role="CLIENT" /></Suspense>
    </ClientShell>
  );
}
