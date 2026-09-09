import { Card } from '@/components/ui/card';

export default function TimetableLoading() {
  return <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading timetable"><div className="h-8 w-72 animate-pulse rounded-md bg-line" /><div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-line" /><Card className="h-20 animate-pulse bg-line/40" /><Card className="h-[28rem] animate-pulse bg-line/40" /><span className="sr-only">Loading timetable...</span></div>;
}