import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { createAcademicYear, setCurrentAcademicYear } from '@/lib/actions/academic';

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export function AcademicYearsPanel({ academicYears }: { academicYears: AcademicYear[] }) {
  return (
    <div>
      <ul className="mb-4 divide-y divide-line">
        {academicYears.map((y) => (
          <li key={y.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {y.name} <span className="help-text">({y.start_date} → {y.end_date})</span>
            </span>
            {y.is_current ? (
              <span className="text-xs font-medium text-brand-dark">Current</span>
            ) : (
              <ActionForm action={setCurrentAcademicYear} submitLabel="Set as current" className="inline">
                <input type="hidden" name="academic_year_id" value={y.id} />
              </ActionForm>
            )}
          </li>
        ))}
        {academicYears.length === 0 && <li className="help-text py-2">No academic years yet.</li>}
      </ul>

      <ActionForm action={createAcademicYear} submitLabel="Add academic year">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="year-name">Name</Label>
            <Input id="year-name" name="name" placeholder="2026" required />
          </div>
          <div>
            <Label htmlFor="start_date">Start date</Label>
            <Input id="start_date" name="start_date" type="date" required />
          </div>
          <div>
            <Label htmlFor="end_date">End date</Label>
            <Input id="end_date" name="end_date" type="date" required />
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
