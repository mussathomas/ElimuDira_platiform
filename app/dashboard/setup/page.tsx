import { requireSchoolSession } from '@/lib/permissions/session';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StepperHeader } from '@/components/setup/stepper-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { updateSchoolProfile } from '@/lib/actions/school';
import { AcademicYearsPanel } from '@/components/academic/academic-years-panel';
import { EducationLevelsPanel } from '@/components/academic/education-levels-panel';
import { ClassesStreamsPanel } from '@/components/academic/classes-streams-panel';
import { SubjectsPanel } from '@/components/academic/subjects-panel';
import { goToNextSetupStep, goToSetupStep, finishSetup, updateGradingSystem } from '@/lib/actions/setup';

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const session = await requireSchoolSession();
  const { step: stepParam } = await searchParams;
  const step = Math.min(Math.max(Number(stepParam) || session.school.setupStep, 1), 8);
  const supabase = await createServerSupabaseClient();

  const [{ data: school }, { data: academicYears }, { data: educationLevels }, { data: classes }, { data: streams }, { data: subjects }, { data: roles }] =
    await Promise.all([
      supabase.from('schools').select('id, name, address, region, district, phone, email, motto, grading_system').eq('id', session.school.id).single(),
      supabase.from('academic_years').select('id, name, start_date, end_date, is_current').eq('school_id', session.school.id).order('name', { ascending: false }),
      supabase.from('education_levels').select('id, name, order_index').eq('school_id', session.school.id).order('order_index'),
      supabase.from('classes').select('id, name, education_level_id, order_index').eq('school_id', session.school.id).order('order_index'),
      supabase.from('streams').select('id, name, class_id').eq('school_id', session.school.id).order('name'),
      supabase.from('subjects').select('id, name, code').eq('school_id', session.school.id).order('name'),
      supabase.from('roles').select('id, name, description, is_system').eq('school_id', session.school.id).order('created_at'),
    ]);

  return (
    <div className="mx-auto max-w-3xl">
      <StepperHeader current={step} />

      {step === 1 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">School information</h2>
          <p className="help-text mb-4">Confirm the details that will appear on reports, letters and certificates.</p>
          <ActionForm action={updateSchoolProfile} submitLabel="Save & continue">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">School name</Label>
                <Input id="name" name="name" defaultValue={school?.name} required />
              </div>
              <div className="col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" defaultValue={school?.address ?? ''} />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" defaultValue={school?.region ?? ''} />
              </div>
              <div>
                <Label htmlFor="district">District</Label>
                <Input id="district" name="district" defaultValue={school?.district ?? ''} />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={school?.phone ?? ''} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={school?.email ?? ''} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="motto">School motto</Label>
                <Input id="motto" name="motto" defaultValue={school?.motto ?? ''} />
              </div>
            </div>
          </ActionForm>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Academic year</h2>
          <p className="help-text mb-4">Create the academic year your school is currently running.</p>
          <AcademicYearsPanel academicYears={academicYears ?? []} />
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Education levels</h2>
          <p className="help-text mb-4">E.g. Primary, O-Level, A-Level — whatever levels your school teaches.</p>
          <EducationLevelsPanel educationLevels={educationLevels ?? []} />
        </Card>
      )}

      {step === 4 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Classes & streams</h2>
          <p className="help-text mb-4">E.g. Form 2 (class) with streams Form 2A, Form 2B.</p>
          <ClassesStreamsPanel
            educationLevels={educationLevels ?? []}
            classes={classes ?? []}
            streams={streams ?? []}
          />
        </Card>
      )}

      {step === 5 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Subjects</h2>
          <p className="help-text mb-4">Subjects taught across the school — assigned to teachers and classes later.</p>
          <SubjectsPanel subjects={subjects ?? []} />
        </Card>
      )}

      {step === 6 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Grading system</h2>
          <p className="help-text mb-4">Choose the grading style your school uses. Detailed grade bands can be configured when Exams & Results is enabled.</p>
          <ActionForm action={updateGradingSystem} submitLabel="Save grading system">
            <Label htmlFor="grading_system">Grading style</Label>
            <Select id="grading_system" name="grading_system" defaultValue={(school as { grading_system?: string } | null)?.grading_system ?? 'percentage'}>
              <option value="percentage">Percentage (0-100)</option>
              <option value="letter">Letter grades (A-F)</option>
              <option value="division">Division (I-IV)</option>
            </Select>
          </ActionForm>
        </Card>
      )}

      {step === 7 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Staff & users</h2>
          <p className="help-text mb-4">Your default roles are ready. Review their permissions now; staff member invitations will be added with the Staff module.</p>
          <ul className="mb-4 divide-y divide-line text-sm">
            {(roles ?? []).map((role) => <li key={role.id} className="flex justify-between py-2"><span>{role.name}</span><span className="help-text">{role.is_system ? 'Full access' : role.description}</span></li>)}
          </ul>
          <Link href="/dashboard/staff/roles" className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-ink hover:bg-paper">Review roles & permissions</Link>
        </Card>
      )}

      {step === 8 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">You&apos;re all set</h2>
          <p className="help-text mb-4">
            {session.school.name} is ready to go. You can still adjust any of this later from Settings.
          </p>
          <form action={finishSetup}>
            <Button type="submit">Go to dashboard</Button>
          </form>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between">
        <form action={goToSetupStep.bind(null, Math.max(step - 1, 1))}>
          <Button type="submit" variant="secondary" disabled={step === 1}>Back</Button>
        </form>
        {step < 8 && (
          <form action={goToNextSetupStep.bind(null, step)}>
            <Button type="submit" variant={step === 6 || step === 7 ? 'secondary' : 'primary'}>
              {step === 6 || step === 7 ? 'Skip for now' : 'Continue'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
