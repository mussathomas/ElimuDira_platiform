import { requirePermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createTimetableRule } from '@/lib/actions/timetable';
import { ActionForm } from '@/components/ui/action-form';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';

export default async function TimetableRulesPage() {
  const session = await requirePermission('edit_timetable_settings');
  const supabase = await createServerSupabaseClient();
  const { data: rules } = await supabase.from('timetable_rules').select('id, name, rules, enabled, updated_at').eq('school_id', session.school!.id).order('name');
  return <div className="space-y-6"><div><h2 className="text-2xl font-semibold text-ink">Scheduling rules</h2><p className="help-text mt-1">Store school rules used by the conflict checker and future timetable generation.</p></div><Card><CardHeader><CardTitle>Add rule</CardTitle></CardHeader><ActionForm action={createTimetableRule} submitLabel="Add rule"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="name">Rule name</Label><Input id="name" name="name" placeholder="Teacher daily lesson limit" required /></div><div><Label htmlFor="max_lessons_per_teacher">Maximum lessons per teacher</Label><Input id="max_lessons_per_teacher" name="max_lessons_per_teacher" type="number" min="0" max="20" defaultValue="8" required /></div></div></ActionForm></Card><Card><CardHeader><CardTitle>Active rules</CardTitle></CardHeader><div className="divide-y divide-line">{(rules ?? []).map((rule: any) => <div key={rule.id} className="flex items-center justify-between py-3 text-sm"><span><strong>{rule.name}</strong><span className="help-text ml-2">{rule.rules?.max_lessons_per_teacher ?? '—'} lessons per teacher</span></span><span className="text-xs text-brand-dark">{rule.enabled ? 'Enabled' : 'Disabled'}</span></div>)}{!rules?.length && <p className="help-text py-3">No scheduling rules configured.</p>}</div></Card></div>;
}
