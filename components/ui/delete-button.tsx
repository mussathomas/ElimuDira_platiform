'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

type ActionResult = { ok: true } | { ok: false; error: string };

export function DeleteButton({
  action,
  id,
  label = 'Remove',
  confirmText = 'Remove this item? This cannot be undone.',
}: {
  action: (id: string) => Promise<ActionResult>;
  id: string;
  label?: string;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          const result = await action(id);
          if (!result.ok) window.alert(result.error);
        });
      }}
    >
      {pending ? '…' : label}
    </Button>
  );
}
