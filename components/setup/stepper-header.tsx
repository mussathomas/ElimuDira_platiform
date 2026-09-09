import { Progress } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STEP_LABELS = [
  'School information',
  'Academic year',
  'Education levels',
  'Classes & streams',
  'Subjects',
  'Grading system',
  'Staff & users',
  'Finish setup',
];

export function StepperHeader({ current }: { current: number }) {
  const percent = Math.round((current / STEP_LABELS.length) * 100);
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">School setup</h1>
        <span className="text-sm font-medium text-muted">{percent}%</span>
      </div>
      <Progress value={percent} className="mb-4" />
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {STEP_LABELS.map((label, i) => {
          const step = i + 1;
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-1.5',
                step === current ? 'font-semibold text-brand-dark' : 'text-muted'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  step < current
                    ? 'bg-brand text-white'
                    : step === current
                    ? 'border-2 border-brand text-brand-dark'
                    : 'border border-border'
                )}
              >
                {step < current ? '✓' : step}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
