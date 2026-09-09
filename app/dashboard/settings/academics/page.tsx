import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { AcademicYearsPanel } from '@/components/academic/academic-years-panel';
import { EducationLevelsPanel } from '@/components/academic/education-levels-panel';
import { ClassesStreamsPanel } from '@/components/academic/classes-streams-panel';
import { SubjectsPanel } from '@/components/academic/subjects-panel';

export default async function AcademicSettingsPage() {
  const session = await requirePermission('edit_settings');
  const supabase = await createServerSupabaseClient();

  const [{ data: academicYears }, { data: educationLevels }, { data: classes }, { data: streams }, { data: subjects }] =
    await Promise.all([
      supabase.from('academic_years').select('id, name, start_date, end_date, is_current').eq('school_id', session.school!.id).order('name', { ascending: false }),
      supabase.from('education_levels').select('id, name, order_index').eq('school_id', session.school!.id).order('order_index'),
      supabase.from('classes').select('id, name, education_level_id, order_index').eq('school_id', session.school!.id).order('order_index'),
      supabase.from('streams').select('id, name, class_id').eq('school_id', session.school!.id).order('name'),
      supabase.from('subjects').select('id, name, code').eq('school_id', session.school!.id).order('name'),
    ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Academic settings</h2>
        <p className="help-text">
          This structure is shared across attendance, exams, syllabus progress and finance — set it up once here.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Academic years</CardTitle></CardHeader>
        <AcademicYearsPanel academicYears={academicYears ?? []} />
      </Card>

      <Card>
        <CardHeader><CardTitle>Education levels</CardTitle></CardHeader>
        <EducationLevelsPanel educationLevels={educationLevels ?? []} />
      </Card>

      <Card>
        <CardHeader><CardTitle>Classes & streams</CardTitle></CardHeader>
        <ClassesStreamsPanel
          educationLevels={educationLevels ?? []}
          classes={classes ?? []}
          streams={streams ?? []}
        />
      </Card>

      <Card>
        <CardHeader><CardTitle>Subjects</CardTitle></CardHeader>
        <SubjectsPanel subjects={subjects ?? []} />
      </Card>
    </div>
  );
}
