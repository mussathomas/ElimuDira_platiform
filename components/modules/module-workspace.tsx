import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

export interface ModuleWorkspaceConfig {
  title: string;
  description: string;
  permission?: string;
  primaryAction?: { label: string; href: string };
  secondaryActions?: { label: string; href: string }[];
  metrics: { label: string; value: string; detail: string }[];
  sections: { title: string; description: string; href?: string; action?: string }[];
}

export function ModuleWorkspace({ config }: { config: ModuleWorkspaceConfig }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Workspace</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">{config.title}</h2>
          <p className="help-text mt-1 max-w-2xl">{config.description}</p>
        </div>
        {config.primaryAction && (
          <Link href={config.primaryAction.href} className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">
            {config.primaryAction.label}
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {config.metrics.map((metric) => (
          <Card key={metric.label} className="p-4">
            <p className="help-text">{metric.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{metric.value}</p>
            <p className="mt-1 text-xs text-muted">{metric.detail}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {config.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
            <p className="help-text">{section.description}</p>
            {section.href && (
              <Link href={section.href} className="mt-4 inline-flex text-sm font-medium text-brand hover:underline">
                {section.action ?? 'Open workspace'}
              </Link>
            )}
          </Card>
        ))}
      </div>

      {config.secondaryActions && config.secondaryActions.length > 0 && (
        <div className="flex flex-wrap gap-3 border-t border-border pt-4">
          {config.secondaryActions.map((action) => (
            <Link key={action.href} href={action.href} className="text-sm font-medium text-brand hover:underline">
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
