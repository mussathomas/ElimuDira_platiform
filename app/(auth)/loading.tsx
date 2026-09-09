import { Card } from '@/components/ui/card';

export default function AuthLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-paper p-6" role="status" aria-live="polite"><Card className="w-full max-w-md"><div className="h-8 w-48 animate-pulse rounded bg-line" /><div className="mt-4 h-10 animate-pulse rounded bg-line/60" /><div className="mt-3 h-10 animate-pulse rounded bg-line/60" /><span className="sr-only">Loading...</span></Card></main>;
}