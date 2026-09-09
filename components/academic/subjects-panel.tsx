import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { createSubject, deleteSubject } from '@/lib/actions/academic';

interface Subject { id: string; name: string; code: string | null; }

export function SubjectsPanel({ subjects }: { subjects: Subject[] }) {
  return (
    <div>
      <ul className="mb-4 divide-y divide-line">
        {subjects.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            {s.name} {s.code && <span className="help-text">({s.code})</span>}
            <DeleteButton action={deleteSubject} id={s.id} />
          </li>
        ))}
        {subjects.length === 0 && <li className="help-text py-2">No subjects yet.</li>}
      </ul>

      <ActionForm action={createSubject} submitLabel="Add subject">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Label htmlFor="subject-name">Subject name</Label>
            <Input id="subject-name" name="name" placeholder="Mathematics" required />
          </div>
          <div>
            <Label htmlFor="code">Code (optional)</Label>
            <Input id="code" name="code" placeholder="MATH" />
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
