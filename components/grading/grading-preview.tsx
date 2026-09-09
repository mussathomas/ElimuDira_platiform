'use client';

import * as React from 'react';
import { calculateResult } from '@/lib/grading/engine';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

export function GradingPreview({
  scheme,
  gradeRanges,
  divisionRanges,
  subjects,
  defaultLevelId,
}: {
  scheme: { id: string; name: string; max_mark: number; minimum_pass_mark: number } | null;
  gradeRanges: Array<{ id: string; grade_name: string; min_score: number; max_score: number; points: number; remark: string | null; passed: boolean | null }>; 
  divisionRanges: Array<{ id: string; division_name: string; min_points: number; max_points: number | null; passed: boolean | null; description: string | null }>; 
  subjects: Array<{ id: string; name: string }>; 
  defaultLevelId?: string | null;
}) {
  const [selectedSubjectId, setSelectedSubjectId] = React.useState(subjects[0]?.id ?? '');
  const [marks, setMarks] = React.useState<Record<string, string>>(() => Object.fromEntries((subjects ?? []).map((subject) => [subject.id, ''])));

  const previewMarks = React.useMemo(() => {
    if (!scheme) return null;

    const ranges = (gradeRanges ?? []).map((range) => ({
      grade: range.grade_name,
      minMark: Number(range.min_score),
      maxMark: Number(range.max_score),
      point: Number(range.points ?? 0),
      remark: range.remark ?? '',
      passed: range.passed ?? true,
      order: 0,
    }));

    const division = {
      subjectsUsed: divisionRanges.length ? Math.max(1, divisionRanges.length) : 1,
      minimumSubjectsRequired: 1,
      maximumSubjectsAllowed: Math.max(1, divisionRanges.length || 1),
      selectionMethod: 'best_n' as const,
      compulsorySubjectIds: [],
      excludedSubjectIds: [],
      includeSubsidiarySubjects: true,
      allowFailedSubjects: true,
      compulsoryMustPass: false,
      failedCompulsoryFailsOverall: false,
      divisionZeroOnFailure: false,
      ranges: (divisionRanges ?? []).map((range, index) => ({
        division: range.division_name,
        minAggregate: Number(range.min_points),
        maxAggregate: range.max_points === null ? null : Number(range.max_points),
        passed: range.passed ?? true,
        remark: range.description ?? '',
        order: index,
      })),
      minimumPassedSubjects: 0,
      maximumFailedSubjects: 999,
      absentStatus: 'Absent' as const,
      missingMarksStatus: 'Incomplete' as const,
      rankingMethod: 'aggregate' as const,
    };

    const subjectInputs = (subjects ?? []).map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      mark: marks[subject.id] === '' ? null : Number(marks[subject.id]),
      absent: false,
      manuallySelected: true,
    }));

    const result = calculateResult({
      maximumMark: Number(scheme.max_mark),
      minimumPassMark: Number(scheme.minimum_pass_mark ?? 0),
      ranges,
      coverageRequired: true,
    }, division, subjectInputs);

    return result;
  }, [gradeRanges, divisionRanges, marks, scheme, subjects]);

  const average = previewMarks && previewMarks.totalMarks !== null && previewMarks.subjects.length
    ? (previewMarks.totalMarks / previewMarks.subjects.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-4 rounded-xl border border-border bg-paper p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Preview</p>
          <h4 className="text-lg font-semibold text-ink">{scheme?.name ?? 'No active scheme selected'}</h4>
        </div>
        <div className="w-full max-w-xs">
          <label className="label-text mb-1.5 block">Test subject</label>
          <Select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
            {(subjects ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(subjects ?? []).map((subject) => (
          <label key={subject.id} className="space-y-1">
            <span className="label-text">{subject.name}</span>
            <Input
              type="number"
              min={0}
              max={scheme?.max_mark ?? 100}
              value={marks[subject.id] ?? ''}
              onChange={(event) => setMarks((current) => ({ ...current, [subject.id]: event.target.value }))}
              placeholder="0"
            />
          </label>
        ))}
      </div>

      {previewMarks && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 font-medium text-ink">Subject</th>
                <th className="px-3 py-2 font-medium text-ink">Mark</th>
                <th className="px-3 py-2 font-medium text-ink">Grade</th>
                <th className="px-3 py-2 font-medium text-ink">Point</th>
              </tr>
            </thead>
            <tbody>
              {previewMarks.subjects.map((subject) => (
                <tr key={subject.subjectId} className="border-t border-border">
                  <td className="px-3 py-2">{subject.subjectName ?? 'Subject'}</td>
                  <td className="px-3 py-2">{subject.mark ?? '—'}</td>
                  <td className="px-3 py-2">{subject.grade ?? '—'}</td>
                  <td className="px-3 py-2">{subject.point ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {previewMarks && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Total points</p>
            <p className="mt-2 text-lg font-semibold text-ink">{previewMarks.aggregate ?? '—'}</p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Average mark</p>
            <p className="mt-2 text-lg font-semibold text-ink">{average}</p>
          </div>
          <div className="rounded-md border border-border bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Division</p>
            <p className="mt-2 text-lg font-semibold text-ink">{previewMarks.division?.division ?? '—'}</p>
          </div>
        </div>
      )}

      {!scheme && <p className="help-text">Create a grading scheme to preview actual grades and division outcomes.</p>}
      {scheme && (!gradeRanges.length || !divisionRanges.length) && (
        <p className="help-text">Add at least one grade and one division range to enable the full preview.</p>
      )}
    </div>
  );
}
