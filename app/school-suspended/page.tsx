import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/permissions/session';
import { Card } from '@/components/ui/card';
import { LogoutButton } from '@/components/sidebar/logout-button';

export default async function SchoolSuspendedPage() {
  const session = await requireSession();
  if (!session.school || session.school.status === 'active') redirect('/dashboard');

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="max-w-md text-center">
        <h1 className="mb-2 text-lg font-semibold text-ink">
          {session.school.name}&apos;s workspace is currently {session.school.status}
        </h1>
        <p className="help-text mb-4">
          Access has been paused by ElimuDira. If you believe this is a mistake, please contact ElimuDira support.
        </p>
        <div className="flex justify-center">
          <LogoutButton />
        </div>
      </Card>
    </div>
  );
}
