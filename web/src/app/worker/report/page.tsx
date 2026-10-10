'use client';

import { Suspense } from 'react';
import { ReportForm } from '@/components/shared-pages';
import { WorkerShell } from '@/components/shells';

export default function WorkerReport() {
  return (
    <WorkerShell>
      <Suspense><ReportForm role="WORKER" /></Suspense>
    </WorkerShell>
  );
}
