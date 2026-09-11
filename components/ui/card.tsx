import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-4 sm:p-6', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-center justify-between', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-ink', className)} {...props} />;
}

const badgeVariants: Record<string, string> = {
  neutral: 'bg-paper text-ink-soft border-border',
  success: 'bg-brand-light text-brand-dark border-transparent',
  warning: 'bg-amber-light text-amber-dark border-transparent',
  danger: 'bg-danger-light text-danger border-transparent',
};

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeVariants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}>
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
