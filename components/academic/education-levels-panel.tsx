import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { createEducationLevel, deleteEducationLevel } from '@/lib/actions/academic';

interface EducationLevel {
  id: string;
  name: string;
}

export function EducationLevelsPanel({ educationLevels }: { educationLevels: EducationLevel[] }) {
  return (
    <div>
      <ul className="mb-4 divide-y divide-line">
        {educationLevels.map((lvl) => (
          <li key={lvl.id} className="flex items-center justify-between py-2 text-sm">
            {lvl.name}
            <DeleteButton action={deleteEducationLevel} id={lvl.id} />
          </li>
        ))}
        {educationLevels.length === 0 && <li className="help-text py-2">No education levels yet.</li>}
      </ul>

      <ActionForm action={createEducationLevel} submitLabel="Add education level">
        <Label htmlFor="level-name">Level name</Label>
        <Input id="level-name" name="name" placeholder="O-Level" required />
      </ActionForm>
    </div>
  );
}
