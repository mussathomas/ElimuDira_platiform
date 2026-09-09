import { Card } from '@/components/ui/card';

export default function ExamsLoading() {
  return <div className="space-y-6" role="status" aria-live="polite"><div className="h-8 w-56 animate-pulse rounded bg-line" /><Card className="h-28 animate-pulse bg-line/40" /><Card className="h-96 animate-pulse bg-line/40" /><span className="sr-only">Loading examinations...</span></div>;
}