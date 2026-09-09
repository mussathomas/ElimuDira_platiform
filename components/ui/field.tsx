import * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('label-text mb-1.5 block', className)} {...props} />;
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted',
      'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-ink',
      'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-danger">{children}</p>;
}
