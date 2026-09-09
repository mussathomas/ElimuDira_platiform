'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
      }}
      className="rounded-md p-2 text-ink-soft hover:bg-paper"
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut size={18} />
    </button>
  );
}
