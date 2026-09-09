import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { createClass, deleteClass, createStream, deleteStream } from '@/lib/actions/academic';

interface EducationLevel { id: string; name: string; }
interface SchoolClass { id: string; name: string; }
interface Stream { id: string; name: string; }

export function ClassesStreamsPanel({
  educationLevels,
  classes,
  streams,
}: {
  educationLevels: EducationLevel[];
  classes: SchoolClass[];
  streams: Stream[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label-text mb-2">Classes</p>
        <ul className="mb-3 divide-y divide-line">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              {c.name}
              <DeleteButton action={deleteClass} id={c.id} />
            </li>
          ))}
          {classes.length === 0 && <li className="help-text py-2">No classes yet.</li>}
        </ul>
        <ActionForm action={createClass} submitLabel="Add class">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="education_level_id">Education level</Label>
              <Select id="education_level_id" name="education_level_id" required defaultValue="">
                <option value="" disabled>Choose a level</option>
                {educationLevels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="class-name">Class name</Label>
              <Input id="class-name" name="name" placeholder="Form 2" required />
            </div>
          </div>
        </ActionForm>
      </div>

      <div>
        <p className="label-text mb-2">Streams</p>
        <ul className="mb-3 divide-y divide-line">
          {streams.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              {s.name}
              <DeleteButton action={deleteStream} id={s.id} />
            </li>
          ))}
          {streams.length === 0 && <li className="help-text py-2">No streams yet.</li>}
        </ul>
        <ActionForm action={createStream} submitLabel="Add stream">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="class_id">Class</Label>
              <Select id="class_id" name="class_id" required defaultValue="">
                <option value="" disabled>Choose a class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="stream-name">Stream name</Label>
              <Input id="stream-name" name="name" placeholder="Form 2A" required />
            </div>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
