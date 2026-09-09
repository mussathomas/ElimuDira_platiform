'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type ActionResult = { ok: true } | { ok: false; error: string };
type ActionFn = (formData: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  className,
  resetOnSuccess = true,
}: {
  action: ActionFn;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = React.useState(0);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      let result: ActionResult;
      try {
        result = await action(formData);
      } catch (error) {
        console.error(error);
        result = { ok: false, error: error instanceof Error ? error.message : 'Operation failed. Please try again.' };
      }
      if (result.ok) {
        if (resetOnSuccess) {
          formRef.current?.reset();
          setResetKey((value) => value + 1);
        }
        router.refresh();
      }
      return result;
    },
    null
  );

  return (
    <form key={resetKey} ref={formRef} action={formAction} className={className}>
      {children}
      {state && !state.ok && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-brand-dark" role="status">{submitLabel} completed successfully.</p>}
      <Button type="submit" disabled={pending} className="mt-3">
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
