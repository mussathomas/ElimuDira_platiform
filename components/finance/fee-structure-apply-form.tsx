'use client';

import * as React from 'react';
import { ActionForm } from '@/components/ui/action-form';
import { Label, Select } from '@/components/ui/field';
import { applyFeeStructureToClass } from '@/lib/actions/finance-ledger';

type FeeClassOption = { id: string; name: string; education_level_id: string | null };
type FeeStructureOption = {
  id: string;
  name: string;
  academicYearName: string;
  class_id: string | null;
  education_level_id: string | null;
};

export function FeeStructureApplyForm({
  classes,
  structures,
}: {
  classes: FeeClassOption[];
  structures: FeeStructureOption[];
}) {
  const [classId, setClassId] = React.useState('');
  const [structureId, setStructureId] = React.useState('');
  const selectedClass = classes.find((item) => item.id === classId);
  const compatibleStructures = structures.filter((structure) =>
    (!structure.class_id || structure.class_id === classId)
    && (!structure.education_level_id || structure.education_level_id === selectedClass?.education_level_id)
  );

  return (
    <ActionForm action={applyFeeStructureToClass} submitLabel="Apply to class" className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="apply_class_id">Class</Label>
        <Select id="apply_class_id" name="class_id" value={classId} onChange={(event) => {
          setClassId(event.target.value);
          setStructureId('');
        }} required>
          <option value="">Choose class</option>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="apply_structure_id">Active fee structure</Label>
        <Select id="apply_structure_id" name="structure_id" value={structureId} onChange={(event) => setStructureId(event.target.value)} required disabled={!selectedClass || !compatibleStructures.length}>
          <option value="">{selectedClass ? 'Choose structure' : 'Choose a class first'}</option>
          {compatibleStructures.map((structure) => <option key={structure.id} value={structure.id}>{structure.name} · {structure.academicYearName}</option>)}
        </Select>
        {selectedClass && !compatibleStructures.length && <p className="help-text mt-1">No active fee structures are available for this class.</p>}
      </div>
    </ActionForm>
  );
}