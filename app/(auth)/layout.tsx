import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Image src="/elimudira_logo.png" alt="ElimuDira" width={40} height={40} className="h-10 w-10 object-contain" />
          <span className="font-display text-lg font-medium text-ink">ElimuDira</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
