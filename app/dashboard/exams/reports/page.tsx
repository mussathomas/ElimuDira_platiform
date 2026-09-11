import { requirePermission } from '@/lib/permissions/session';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { loadStudentReports } from '@/lib/reports/student-reports';
import { ActionForm } from '@/components/ui/action-form';
import { sendClassReportsToGuardians } from '@/lib/actions/exams';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class_id?: string; examination_id?: string }> }) {
  const session = await requirePermission('download_reports');
  const params = await searchParams;
  const data = await loadStudentReports(session.school!.id, params.class_id, params.examination_id);
  const pdfParams = new URLSearchParams();
  if (params.class_id) pdfParams.set('class_id', params.class_id);
  if (params.examination_id) pdfParams.set('examination_id', params.examination_id);
  const pdfHref = `/api/exams/reports/pdf${pdfParams.toString() ? `?${pdfParams.toString()}` : ''}`;
  const resultsByStudent = new Map<string, any[]>();
  for (const result of data.results as any[]) resultsByStudent.set(result.student_id, [...(resultsByStudent.get(result.student_id) ?? []), result]);
  const school = data.school;
  const schoolLine = [school?.address, school?.region, school?.district].filter(Boolean).join(', ') || 'School details not configured';

  return (
    <main className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-lg font-semibold text-ink">{school?.name ?? session.school!.name}</p><p className="help-text">{schoolLine}{school?.phone ? ` · ${school.phone}` : ''}{school?.email ? ` · ${school.email}` : ''}</p>{school?.motto && <p className="help-text italic">{school.motto}</p>}<h2 className="mt-3 text-xl font-semibold text-ink">Class reports</h2><p className="help-text mt-1">A printable roster of finalized reports, grouped by student.</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div><label className="label-text" htmlFor="class_id">Class</label><Select id="class_id" name="class_id" defaultValue={params.class_id ?? ''}><option value="">All classes</option>{(data.classes as any[]).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
              <div><label className="label-text" htmlFor="examination_id">Examination</label><Select id="examination_id" name="examination_id" defaultValue={params.examination_id ?? ''}><option value="">All examinations</option>{(data.examinations as any[]).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.term})</option>)}</Select></div>
              <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" type="submit">View</button>
            </form>
            <a className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink" href={pdfHref}>Download PDF</a>
            {session.permissions.has('send_reports') && <ActionForm action={sendClassReportsToGuardians} submitLabel="Send to guardians"><input type="hidden" name="class_id" value={params.class_id ?? ''} /></ActionForm>}
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Examination</th><th className="px-3 py-3">Average</th><th className="px-3 py-3">Division</th><th className="px-3 py-3">Position</th><th className="px-3 py-3">Status</th></tr></thead>
            <tbody>{(data.students as any[]).flatMap((student) => (resultsByStudent.get(student.id) ?? []).map((summary: any) => { const exam = Array.isArray(summary.examinations) ? summary.examinations[0] : summary.examinations; return <tr key={`${student.id}-${summary.examination_id}`} className="border-b border-line"><td className="px-3 py-3"><p className="font-medium text-ink">{student.admission_number} · {student.first_name} {student.last_name}</p><p className="text-xs text-muted">Guardian: {student.guardian_name ?? 'Not provided'}</p></td><td className="px-3 py-3">{student.classes?.name ?? 'Unassigned'}</td><td className="px-3 py-3">{exam?.name ?? 'Examination'}<p className="text-xs text-muted">{exam?.term ?? ''}</p></td><td className="px-3 py-3">{summary.average_mark != null ? Number(summary.average_mark).toFixed(2) : 'Pending'}</td><td className="px-3 py-3">{summary.division ?? 'Pending'}</td><td className="px-3 py-3">{summary.position ?? 'Pending'}</td><td className="px-3 py-3">{summary.overall_status ?? 'Awaiting processing'}</td></tr>; }))}</tbody>
          </table>
        </div>
        {!(data.results as any[]).length && <p className="p-4 help-text">No finalized reports are available for this selection.</p>}
      </Card>
    </main>
  );
}
