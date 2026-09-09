'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setSchoolStatus } from '@/lib/actions/platform';
import type { SchoolStatus } from '@/types/database';

export function SchoolStatusActions({ schoolId, status }: { schoolId: string; status: SchoolStatus }) {
  const [pending, startTransition] = useTransition();

  const change = (next: SchoolStatus, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await setSchoolStatus(schoolId, next);
      if (!result.ok) window.alert(result.error);
    });
  };

  return (
    <div className="flex justify-end gap-2">
      {status !== 'active' && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => change('active')}>
          Activate
        </Button>
      )}
      {status !== 'suspended' && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => change('suspended', 'Suspend this school? Its staff will be signed out immediately.')}
        >
          Suspend
        </Button>
      )}
      {status !== 'deactivated' && (
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => change('deactivated', 'Deactivate this school? This is meant to be a longer-term/permanent state.')}
        >
          Deactivate
        </Button>
      )}
    </div>
  );
}
