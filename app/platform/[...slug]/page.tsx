import { notFound } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/permissions/session';
import { findNavLeafByHref } from '@/lib/permissions/nav';
import { ModuleWorkspace } from '@/components/modules/module-workspace';
import { getPlatformWorkspace } from '@/lib/modules/workspaces';

export default async function PlatformModuleWorkspacePage({ params }: { params: Promise<{ slug: string[] }> }) {
  await requireSuperAdmin();
  const { slug } = await params;
  const href = `/platform/${slug.join('/')}`;
  const leaf = findNavLeafByHref(href);

  if (!leaf) notFound();

  return <ModuleWorkspace config={getPlatformWorkspace(href, leaf.label)} />;
}
