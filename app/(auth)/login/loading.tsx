import { Card } from '@/components/ui/card';

export default function LoginLoading() {
  return (
    <Card role="status" aria-live="polite" aria-label="Loading sign in">
      <div className="h-8 w-32 animate-pulse rounded bg-line" />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-line/60" />
      <div className="mt-6 space-y-4">
        <div className="h-10 animate-pulse rounded bg-line/60" />
        <div className="h-10 animate-pulse rounded bg-line/60" />
        <div className="h-10 animate-pulse rounded bg-line/60" />
      </div>
      <span className="sr-only">Loading sign in...</span>
    </Card>
  );
}
