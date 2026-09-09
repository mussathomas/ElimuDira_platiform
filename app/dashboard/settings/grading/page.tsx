import { requireGradingViewer } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/action-form';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { GradingPreview } from '@/components/grading/grading-preview';
import {
  createGradingScheme,
  updateGradingScheme,
  deleteGradingScheme,
  addGradeRange,
  updateGradeRange,
  deleteGradeRange,
  createDivisionRule,
  updateDivisionRule,
  deleteDivisionRule,
  addDivisionRange,
  updateDivisionRange,
  deleteDivisionRange,
  saveSubjectSelectionRule,
} from '@/lib/actions/grading-settings';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm text-ink">
      <span className="label-text">{label}</span>
      {children}
    </label>
  );
}

async function querySelectionRules(supabase: any) {
  const { data, error } = await supabase
    .from('subject_selection_rules')
    .select('id, name, description, education_level_id, academic_year_id, subjects_considered, selection_method')
    .eq('school_id', (await requireGradingViewer()).school!.id)
    .order('created_at', { ascending: false });

  if (error && (error.code === '42P01' || error.message?.includes('Could not find the table') || error.message?.includes('subject_selection_rules'))) {
    return { data: [] };
  }

  return { data: data ?? [] };
}

async function querySelectionRuleItems(supabase: any, schoolId: string) {
  const { data, error } = await supabase
    .from('subject_selection_rule_items')
    .select('id, rule_id, subject_id, item_type')
    .eq('school_id', schoolId);

  if (error && (error.code === '42P01' || error.message?.includes('Could not find the table') || error.message?.includes('subject_selection_rule_items'))) {
    return { data: [] };
  }

  return { data: data ?? [] };
}

export default async function GradingSettingsPage() {
  const session = await requireGradingViewer();
  const supabase = await createServerSupabaseClient();

  const [{ data: educationLevels }, { data: academicYears }, { data: subjects }, { data: schemes }, { data: divisionRules }, { data: selectionRules }] =
    await Promise.all([
      supabase.from('education_levels').select('id, name').eq('school_id', session.school!.id).order('order_index'),
      supabase.from('academic_years').select('id, name').eq('school_id', session.school!.id).order('name', { ascending: false }),
      supabase.from('subjects').select('id, name').eq('school_id', session.school!.id).order('name'),
      supabase.from('grading_scales').select('id, name, description, education_level_id, academic_year_id, max_mark, minimum_pass_mark, status').eq('school_id', session.school!.id).order('created_at', { ascending: false }),
      supabase.from('division_rules').select('id, name, description, education_level_id, academic_year_id, subjects_counted, minimum_subjects_required, maximum_subjects_allowed, selection_method, status').eq('school_id', session.school!.id).order('created_at', { ascending: false }),
      querySelectionRules(supabase),
    ]);

  const activeScheme = (schemes ?? []).find((scheme: any) => scheme.status === 'active') ?? (schemes ?? [])[0] ?? null;
  const schemeId = activeScheme?.id ?? '';

  const [{ data: gradeRanges }, { data: divisionBands }, { data: ruleItems }] = await Promise.all([
    supabase.from('grade_bands').select('id, grade_name, min_score, max_score, points, remark, passed, order_index').eq('grading_scale_id', schemeId).order('min_score', { ascending: true }),
    supabase.from('division_bands').select('id, division_rule_id, division_name, min_points, max_points, description, passed, order_index').in('division_rule_id', (divisionRules ?? []).map((rule: any) => rule.id)).order('min_points', { ascending: true }),
    querySelectionRuleItems(supabase, session.school!.id),
  ]);

  const rulesById = new Map((selectionRules ?? []).map((rule: any) => [rule.id, rule]));
  const ruleIdToSubjects = new Map<string, { subjectId: string; itemType: string }[]>();
  for (const item of ruleItems ?? []) {
    const current = ruleIdToSubjects.get(item.rule_id) ?? [];
    current.push({ subjectId: item.subject_id, itemType: item.item_type });
    ruleIdToSubjects.set(item.rule_id, current);
  }

  const schoolSubjects = (subjects ?? []).map((subject: any) => ({
    id: subject.id,
    name: subject.name,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">Grading</h2>
        <p className="help-text">Configure grading schemes, grade ranges, division ranges, and subject selection rules for the school.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Grading schemes</CardTitle>
          <Badge variant={activeScheme ? 'success' : 'neutral'}>{activeScheme ? activeScheme.name : 'No active scheme'}</Badge>
        </CardHeader>

        <ActionForm action={createGradingScheme} submitLabel="Create scheme" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Scheme name">
              <Input name="name" placeholder="O-Level Grading Scheme" required />
            </Field>
            <Field label="Education level">
              <Select name="education_level_id" defaultValue="">
                <option value="">Select level</option>
                {(educationLevels ?? []).map((level: any) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Maximum marks">
              <Input name="max_mark" type="number" min={1} defaultValue={100} required />
            </Field>
            <Field label="Academic year">
              <Select name="academic_year_id" defaultValue="">
                <option value="">All years</option>
                {(academicYears ?? []).map((year: any) => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input name="description" placeholder="Schoolwide grading policy for O-Level" />
          </Field>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="hidden" name="status" value="inactive" />
              <input type="checkbox" name="status" value="active" defaultChecked />
              Active immediately
            </label>
          </div>
        </ActionForm>

        <div className="mt-6 space-y-3">
          {(schemes ?? []).length ? (schemes ?? []).map((scheme: any) => (
            <div key={scheme.id} className="rounded-md border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h4 className="font-semibold text-ink">{scheme.name}</h4>
                  <p className="text-sm text-muted">{scheme.description ?? 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={scheme.status === 'active' ? 'success' : 'neutral'}>{scheme.status}</Badge>
                  <DeleteButton action={deleteGradingScheme} id={scheme.id} label="Delete" />
                </div>
              </div>

              <ActionForm action={updateGradingScheme} submitLabel="Save scheme" className="mt-4 space-y-4">
                <input type="hidden" name="id" value={scheme.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Scheme name">
                    <Input name="name" defaultValue={scheme.name} required />
                  </Field>
                  <Field label="Education level">
                    <Select name="education_level_id" defaultValue={scheme.education_level_id ?? ''}>
                      <option value="">Select level</option>
                      {(educationLevels ?? []).map((level: any) => (
                        <option key={level.id} value={level.id}>{level.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Maximum marks">
                    <Input name="max_mark" type="number" min={1} defaultValue={scheme.max_mark ?? 100} required />
                  </Field>
                  <Field label="Academic year">
                    <Select name="academic_year_id" defaultValue={scheme.academic_year_id ?? ''}>
                      <option value="">All years</option>
                      {(academicYears ?? []).map((year: any) => (
                        <option key={year.id} value={year.id}>{year.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Description">
                  <Input name="description" defaultValue={scheme.description ?? ''} />
                </Field>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="hidden" name="status" value="inactive" />
                    <input type="checkbox" name="status" value="active" defaultChecked={scheme.status === 'active'} />
                    Active
                  </label>
                </div>
              </ActionForm>
            </div>
          )) : <p className="help-text">No grading schemes have been created yet.</p>}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grade ranges</CardTitle>
          <Badge variant="neutral">{(gradeRanges ?? []).length} configured</Badge>
        </CardHeader>

        {activeScheme ? (
          <>
            <ActionForm action={addGradeRange} submitLabel="Add grade" className="space-y-4">
              <input type="hidden" name="grading_scale_id" value={activeScheme.id} />
              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Grade">
                  <Input name="grade_name" placeholder="A" required />
                </Field>
                <Field label="Min mark">
                  <Input name="min_score" type="number" min={0} defaultValue={0} required />
                </Field>
                <Field label="Max mark">
                  <Input name="max_score" type="number" min={0} defaultValue={100} required />
                </Field>
                <Field label="Point">
                  <Input name="points" type="number" min={0} defaultValue={1} required />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Remark">
                  <Input name="remark" placeholder="Excellent" />
                </Field>
                <Field label="Order">
                  <Input name="order_index" type="number" min={0} defaultValue={0} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="hidden" name="passed" value="false" />
                <input type="checkbox" name="passed" value="true" defaultChecked />
                Passed grade
              </label>
            </ActionForm>

            <div className="mt-6 overflow-hidden rounded-md border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2">Grade</th>
                    <th className="px-3 py-2">Min</th>
                    <th className="px-3 py-2">Max</th>
                    <th className="px-3 py-2">Point</th>
                    <th className="px-3 py-2">Remark</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(gradeRanges ?? []).map((range: any) => (
                    <tr key={range.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <ActionForm action={updateGradeRange} submitLabel="Save" className="space-y-2">
                          <input type="hidden" name="id" value={range.id} />
                          <input type="hidden" name="grading_scale_id" value={activeScheme.id} />
                          <Input name="grade_name" defaultValue={range.grade_name} required />
                          <Input name="remark" defaultValue={range.remark ?? ''} />
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2">
                        <ActionForm action={updateGradeRange} submitLabel="Save" className="space-y-2">
                          <input type="hidden" name="id" value={range.id} />
                          <input type="hidden" name="grading_scale_id" value={activeScheme.id} />
                          <Input name="min_score" type="number" min={0} defaultValue={range.min_score} required />
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2">
                        <ActionForm action={updateGradeRange} submitLabel="Save" className="space-y-2">
                          <input type="hidden" name="id" value={range.id} />
                          <input type="hidden" name="grading_scale_id" value={activeScheme.id} />
                          <Input name="max_score" type="number" min={0} defaultValue={range.max_score} required />
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2">
                        <ActionForm action={updateGradeRange} submitLabel="Save" className="space-y-2">
                          <input type="hidden" name="id" value={range.id} />
                          <input type="hidden" name="grading_scale_id" value={activeScheme.id} />
                          <Input name="points" type="number" min={0} defaultValue={range.points} required />
                        </ActionForm>
                      </td>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input type="hidden" name="passed" value="false" />
                          <input type="checkbox" defaultChecked={range.passed ?? true} />
                          Passed
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <DeleteButton action={deleteGradeRange} id={range.id} label="Delete" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="help-text">Create a grading scheme before adding grade ranges.</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Division ranges</CardTitle>
          <Badge variant="neutral">{(divisionRules ?? []).length} configured</Badge>
        </CardHeader>

        <ActionForm action={createDivisionRule} submitLabel="Create division rule" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Rule name">
              <Input name="name" placeholder="O-Level Division Rule" required />
            </Field>
            <Field label="Education level">
              <Select name="education_level_id" defaultValue="">
                <option value="">Select level</option>
                {(educationLevels ?? []).map((level: any) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Subjects counted">
              <Input name="subjects_counted" type="number" min={1} defaultValue={7} required />
            </Field>
            <Field label="Minimum required">
              <Input name="minimum_subjects_required" type="number" min={1} defaultValue={7} required />
            </Field>
            <Field label="Maximum allowed">
              <Input name="maximum_subjects_allowed" type="number" min={1} defaultValue={7} required />
            </Field>
            <Field label="Selection method">
              <Select name="selection_method" defaultValue="best_n">
                <option value="best_n">Best N</option>
                <option value="all_subjects">All subjects</option>
                <option value="compulsory_plus_best_optional">Compulsory + best optional</option>
                <option value="manual">Manual selection</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input name="description" placeholder="Division calculation policy" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="hidden" name="status" value="inactive" />
            <input type="checkbox" name="status" value="active" defaultChecked />
            Active immediately
          </label>
        </ActionForm>

        <div className="mt-6 space-y-4">
          {(divisionRules ?? []).map((rule: any) => (
            <div key={rule.id} className="rounded-md border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h4 className="font-semibold text-ink">{rule.name}</h4>
                  <p className="text-sm text-muted">{rule.description ?? 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.status === 'active' ? 'success' : 'neutral'}>{rule.status}</Badge>
                  <DeleteButton action={deleteDivisionRule} id={rule.id} label="Delete" />
                </div>
              </div>

              <ActionForm action={updateDivisionRule} submitLabel="Save rule" className="mt-4 space-y-4">
                <input type="hidden" name="id" value={rule.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Rule name">
                    <Input name="name" defaultValue={rule.name} required />
                  </Field>
                  <Field label="Education level">
                    <Select name="education_level_id" defaultValue={rule.education_level_id ?? ''}>
                      <option value="">Select level</option>
                      {(educationLevels ?? []).map((level: any) => (
                        <option key={level.id} value={level.id}>{level.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Subjects counted">
                    <Input name="subjects_counted" type="number" min={1} defaultValue={rule.subjects_counted ?? 7} required />
                  </Field>
                  <Field label="Minimum required">
                    <Input name="minimum_subjects_required" type="number" min={1} defaultValue={rule.minimum_subjects_required ?? 7} required />
                  </Field>
                  <Field label="Maximum allowed">
                    <Input name="maximum_subjects_allowed" type="number" min={1} defaultValue={rule.maximum_subjects_allowed ?? 7} required />
                  </Field>
                  <Field label="Selection method">
                    <Select name="selection_method" defaultValue={rule.selection_method ?? 'best_n'}>
                      <option value="best_n">Best N</option>
                      <option value="all_subjects">All subjects</option>
                      <option value="compulsory_plus_best_optional">Compulsory + best optional</option>
                      <option value="manual">Manual selection</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Description">
                  <Input name="description" defaultValue={rule.description ?? ''} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="hidden" name="status" value="inactive" />
                  <input type="checkbox" name="status" value="active" defaultChecked={rule.status === 'active'} />
                  Active
                </label>
              </ActionForm>

              <div className="mt-4 rounded-md border border-border p-3">
                <p className="mb-3 text-sm font-medium text-ink">Division bands</p>
                <ActionForm action={addDivisionRange} submitLabel="Add division" className="grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="division_rule_id" value={rule.id} />
                  <Field label="Division">
                    <Input name="division_name" placeholder="Division I" required />
                  </Field>
                  <Field label="Min points">
                    <Input name="min_points" type="number" min={0} defaultValue={0} required />
                  </Field>
                  <Field label="Max points">
                    <Input name="max_points" type="number" min={0} placeholder="Leave blank for no cap" />
                  </Field>
                  <Field label="Description">
                    <Input name="description" placeholder="Top band" />
                  </Field>
                  <Field label="Order">
                    <Input name="order_index" type="number" min={0} defaultValue={0} />
                  </Field>
                </ActionForm>

                <div className="mt-4 space-y-3">
                  {((divisionBands ?? []).filter((band: any) => band.division_rule_id === rule.id) || []).map((band: any) => (
                    <ActionForm key={band.id} action={updateDivisionRange} submitLabel="Save band" className="space-y-3 rounded-md border border-border bg-paper p-3">
                      <input type="hidden" name="id" value={band.id} />
                      <div className="grid gap-3 md:grid-cols-5">
                        <Field label="Division">
                          <Input name="division_name" defaultValue={band.division_name} required />
                        </Field>
                        <Field label="Min points">
                          <Input name="min_points" type="number" min={0} defaultValue={band.min_points} required />
                        </Field>
                        <Field label="Max points">
                          <Input name="max_points" type="number" min={0} defaultValue={band.max_points ?? ''} placeholder="Leave blank for no cap" />
                        </Field>
                        <Field label="Description">
                          <Input name="description" defaultValue={band.description ?? ''} />
                        </Field>
                        <div className="space-y-2">
                          <Field label="Order">
                            <Input name="order_index" type="number" min={0} defaultValue={band.order_index ?? 0} />
                          </Field>
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input type="hidden" name="passed" value="false" />
                            <input type="checkbox" name="passed" value="true" defaultChecked={band.passed ?? true} />
                            Passed
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <DeleteButton action={deleteDivisionRange} id={band.id} label="Delete" />
                      </div>
                    </ActionForm>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject selection rules</CardTitle>
          <Badge variant="neutral">{(selectionRules ?? []).length} rules</Badge>
        </CardHeader>

        <ActionForm action={saveSubjectSelectionRule} submitLabel="Save rules" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Education level">
              <Select name="education_level_id" defaultValue="">
                <option value="">Select level</option>
                {(educationLevels ?? []).map((level: any) => (
                  <option key={level.id} value={level.id}>{level.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Academic year">
              <Select name="academic_year_id" defaultValue="">
                <option value="">All years</option>
                {(academicYears ?? []).map((year: any) => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Rule name">
              <Input name="name" defaultValue="Subject selection rule" required />
            </Field>
            <Field label="Subjects considered">
              <Input name="subjects_considered" type="number" min={1} defaultValue={7} required />
            </Field>
          </div>
          <Field label="Selection method">
            <Select name="selection_method" defaultValue="best_n">
              <option value="best_n">Best N</option>
              <option value="all_subjects">All subjects</option>
              <option value="compulsory_plus_best_optional">Compulsory + best optional</option>
              <option value="manual">Manual selection</option>
            </Select>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 label-text">Required subjects</p>
              <div className="space-y-2 rounded-md border border-border p-3">
                {(schoolSubjects ?? []).map((subject: any) => (
                  <label key={subject.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="required_subjects" value={subject.id} />
                    {subject.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 label-text">Excluded subjects</p>
              <div className="space-y-2 rounded-md border border-border p-3">
                {(schoolSubjects ?? []).map((subject: any) => (
                  <label key={`${subject.id}-excluded`} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="excluded_subjects" value={subject.id} />
                    {subject.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 label-text">Optional subjects</p>
              <div className="space-y-2 rounded-md border border-border p-3">
                {(schoolSubjects ?? []).map((subject: any) => (
                  <label key={`${subject.id}-optional`} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="optional_subjects" value={subject.id} />
                    {subject.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 label-text">Compulsory subjects</p>
              <div className="space-y-2 rounded-md border border-border p-3">
                {(schoolSubjects ?? []).map((subject: any) => (
                  <label key={`${subject.id}-compulsory`} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name="compulsory_subjects" value={subject.id} />
                    {subject.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test calculation</CardTitle>
        </CardHeader>
        <GradingPreview
          scheme={activeScheme}
          gradeRanges={gradeRanges ?? []}
          divisionRanges={divisionBands ?? []}
          subjects={schoolSubjects}
          defaultLevelId={activeScheme?.education_level_id ?? null}
        />
      </Card>
    </div>
  );
}
