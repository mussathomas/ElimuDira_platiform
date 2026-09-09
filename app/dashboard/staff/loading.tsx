import { Card } from '@/components/ui/card';

export default function StaffLoading() {
  return <div className="space-y-6" role="status" aria-live="polite"><div className="h-8 w-48 animate-pulse rounded bg-line" /><Card className="h-24 animate-pulse bg-line/40" /><Card className="h-96 animate-pulse bg-line/40" /><span className="sr-only">Loading staff...</span></div>;
}