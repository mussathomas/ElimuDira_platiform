'use client';

import { Label, Select } from '@/components/ui/field';

type ClassOption = { id: string; name: string };

export function MarksClassSelect({
  classes,
  defaultValue,
  autoSubmit,
}: {
  classes: ClassOption[];
  defaultValue: string;
  autoSubmit: boolean;
}) {
  return (
    <div>
      <Label htmlFor="class_id">Class</Label>
      <Select
        id="class_id"
        name="class_id"
        defaultValue={defaultValue}
        onChange={(event) => {
          if (autoSubmit) event.currentTarget.form?.requestSubmit();
        }}
        required
      >
        <option value="">Choose class</option>
        {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
    </div>
  );
}