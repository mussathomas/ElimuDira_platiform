import { requirePermission } from '@/lib/permissions/session';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { loadStudentReports } from '@/lib/reports/student-reports';

export default async function ClassResultsPage({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const session = await requirePermission('view_exams');
  const params = await searchParams;
  const data = await loadStudentReports(session.school!.id, params.class_id);
  const studentsById = new Map((data.students as any[]).map((student) => [student.id, student]));
  const marksByResult = new Map<string, any[]>();

  for (const mark of data.marks as any[]) {
    const key = `${mark.student_id}-${mark.examination_id}`;
    marksByResult.set(key, [...(marksByResult.get(key) ?? []), mark]);
  }

  const school = data.school;
  const schoolLine = [school?.address, school?.region, school?.district].filter(Boolean).join(', ') || 'School details not configured';

  return (
    <main className="space-y-6">
      <Card>
        <div className="border-b border-border pb-4">
          <p className="text-lg font-semibold text-ink">{school?.name ?? session.school!.name}</p>
          <p className="help-text">{schoolLine}{school?.phone ? ` · ${school.phone}` : ''}{school?.email ? ` · ${school.email}` : ''}</p>
          {school?.motto && <p className="help-text italic">{school.motto}</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Class results</h2>
            <p className="help-text mt-1">{data.selectedClass?.name ?? 'All classes'} · A roster of marks and calculated results.</p>
          </div>
          <form method="get" className="flex items-end gap-2">
            <div>
              <label className="label-text" htmlFor="class_id">Class</label>
              <Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''}>
                <option value="">All classes</option>
                {(data.classes as any[]).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
            <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" type="submit">View</button>
          </form>
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted">
              <tr>
                <th className="px-3 py-3">Student</th><th className="px-3 py-3">Examination</th><th className="px-3 py-3">Subjects</th>
                <th className="px-3 py-3">Total</th><th className="px-3 py-3">Average</th><th className="px-3 py-3">Division</th><th className="px-3 py-3">Position</th>
              </tr>
            </thead>
            <tbody>
              {(data.results as any[]).map((result) => {
                const student = studentsById.get(result.student_id);
                const exam = Array.isArray(result.examinations) ? result.examinations[0] : result.examinations;
                const marks = marksByResult.get(`${result.student_id}-${result.examination_id}`) ?? [];
                return <tr key={`${result.student_id}-${result.examination_id}`} className="border-b border-line align-top">
                  <td className="px-3 py-3"><p className="font-medium text-ink">{student?.first_name} {student?.last_name}</p><p className="text-xs text-muted">{student?.admission_number ?? 'No admission number'} · {student?.classes?.name ?? 'Unassigned'}</p></td>
                  <td className="px-3 py-3">{exam?.name ?? 'Examination'}<p className="text-xs text-muted">{exam?.term ?? ''}</p></td>
                  <td className="max-w-sm px-3 py-3"><div className="flex flex-wrap gap-1">{marks.map((mark, index) => <span key={`${mark.subject_id ?? index}-${mark.score}`} className="rounded border border-border px-2 py-1 text-xs">{mark.subjects?.name ?? 'Subject'}: {mark.score ?? 'Pending'}{mark.grade ? ` (${mark.grade})` : ''}</span>)}</div></td>
                  <td className="px-3 py-3">{result.total_marks ?? (marks.length ? marks.reduce((sum, mark) => sum + Number(mark.score ?? 0), 0) : 'Pending')}</td>
                  <td className="px-3 py-3">{result.average_mark != null ? Number(result.average_mark).toFixed(2) : 'Pending'}</td>
                  <td className="px-3 py-3">{result.division ?? 'Pending'}</td>
                  <td className="px-3 py-3 font-semibold">{result.position ?? 'Pending'}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!(data.results as any[]).length && <p className="p-4 help-text">No marks or processed results are available for this class.</p>}
      </Card>
    </main>
  );
}
