import { Card } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading dashboard">
      <Card className="h-40 animate-pulse bg-line/40" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-28 animate-pulse bg-line/40" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="h-64 animate-pulse bg-line/40 xl:col-span-3" />
        <Card className="h-64 animate-pulse bg-line/40 xl:col-span-2" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="h-64 animate-pulse bg-line/40" />
        <Card className="h-64 animate-pulse bg-line/40" />
      </div>
      <span className="sr-only">Loading dashboard...</span>
    </div>
  );
}