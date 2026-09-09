import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-white font-display text-sm">
            ED
          </div>
          <span className="font-display text-lg font-medium text-ink">ElimuDira</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
