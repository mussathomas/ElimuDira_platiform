import { Card } from '@/components/ui/card';

export default function DashboardLoading() {
  return <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading page"><div className="h-8 w-64 animate-pulse rounded-md bg-line" /><div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-line" /><div className="grid gap-4 md:grid-cols-3"><Card className="h-28 animate-pulse bg-line/40" /><Card className="h-28 animate-pulse bg-line/40" /><Card className="h-28 animate-pulse bg-line/40" /></div><Card className="h-72 animate-pulse bg-line/40" /><span className="sr-only">Loading page...</span></div>;
}