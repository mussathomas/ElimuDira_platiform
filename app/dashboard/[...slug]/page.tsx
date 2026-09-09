import { notFound } from 'next/navigation';
import { requireSchoolSession } from '@/lib/permissions/session';
import { findNavLeafByHref } from '@/lib/permissions/nav';
import { ModuleWorkspace } from '@/components/modules/module-workspace';
import { getSchoolWorkspace } from '@/lib/modules/workspaces';
import { Card } from '@/components/ui/card';

export default async function ModuleWorkspacePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const session = await requireSchoolSession();
  const { slug } = await params;
  const href = `/dashboard/${slug.join('/')}`;
  const leaf = findNavLeafByHref(href);

  if (!leaf) notFound();
  if (leaf.permission && !session.permissions.has(leaf.permission) && !session.isSuperAdmin) {
    return (
      <Card>
        <p className="text-ink-soft">You do not have permission to access this page.</p>
      </Card>
    );
  }

  return <ModuleWorkspace config={getSchoolWorkspace(href, leaf.label)} />;
}
