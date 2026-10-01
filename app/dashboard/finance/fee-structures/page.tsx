import { requireAnyPermission } from '@/lib/permissions/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionForm } from '@/components/ui/action-form';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { FeeStructureForm } from '@/components/finance/fee-structure-form';
import { applyFeeStructureToClass, createFinanceCategory, setFinanceFeeStructureActive } from '@/lib/actions/finance-ledger';

const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);

export default async function FinanceFeeStructuresPage() {
  const session = await requireAnyPermission(['view_finance', 'manage_fee_structures']);
  const supabase = await createServerSupabaseClient();
  const schoolId = session.school!.id;
  const [{ data: years }, { data: classes }, { data: levels }, { data: categories }, { data: structures }] = await Promise.all([
    supabase.from('academic_years').select('id, name, is_current').eq('school_id', schoolId).order('start_date', { ascending: false }),
    supabase.from('classes').select('id, name').eq('school_id', schoolId).order('order_index'),
    supabase.from('education_levels').select('id, name').eq('school_id', schoolId).order('order_index'),
    supabase.from('finance_fee_categories').select('id, name, active').eq('school_id', schoolId).order('name'),
    supabase.from('fee_structures').select('id, name, amount, active, academic_year_id, class_id, education_level_id, academic_years(name), classes(name), education_levels(name), fee_structure_items(id, name, amount, due_date, installment_count, finance_fee_categories(name))').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(50),
  ]);
  const canManageStructures = session.permissions.has('manage_fee_structures');
  const canApply = session.permissions.has('create_student_charges');
  const activeCategories = (categories ?? []).filter((category) => category.active);
  const initialYearId = (years ?? []).find((year) => year.is_current)?.id ?? years?.[0]?.id ?? '';

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-5">
        <p className="text-sm font-medium uppercase text-brand">Finance</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Fee structures</h2>
        <p className="help-text mt-1">Set academic-year fees by class or education level, then apply them to enrolled students.</p>
      </header>

      {canManageStructures && <Card>
        <CardHeader><CardTitle>Fee categories</CardTitle></CardHeader>
        <div className="mb-4 flex flex-wrap gap-2">{activeCategories.map((category) => <span key={category.id} className="border-r border-line pr-2 text-sm text-ink-soft last:border-0">{category.name}</span>)}{!activeCategories.length && <p className="help-text">Add the categories your school uses, such as tuition or transport.</p>}</div>
        <ActionForm action={createFinanceCategory} submitLabel="Add category" className="flex max-w-xl items-end gap-3">
          <div className="min-w-0 flex-1"><Label htmlFor="finance_category_name">New category</Label><Input id="finance_category_name" name="name" placeholder="e.g. Tuition" maxLength={80} required /></div>
        </ActionForm>
      </Card>}

      {canManageStructures && <Card>
        <CardHeader><CardTitle>Create fee structure</CardTitle></CardHeader>
        {years?.length && activeCategories.length ? <FeeStructureForm years={years} classes={classes ?? []} educationLevels={levels ?? []} categories={activeCategories} initialYearId={initialYearId} /> : <p className="help-text">Set up an academic year and at least one active fee category before creating a structure.</p>}
      </Card>}

      {canApply && <Card>
        <CardHeader><CardTitle>Apply structure to a class</CardTitle></CardHeader>
        <p className="help-text mb-4">Creates charges against existing student enrollments. Reapplying a structure does not duplicate installments.</p>
        <ActionForm action={applyFeeStructureToClass} submitLabel="Apply to class" className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="apply_structure_id">Active fee structure</Label><Select id="apply_structure_id" name="structure_id" defaultValue="" required><option value="" disabled>Choose structure</option>{(structures ?? []).filter((structure) => structure.active && (structure.fee_structure_items as unknown[] | null)?.length).map((structure) => { const year = Array.isArray(structure.academic_years) ? structure.academic_years[0] : structure.academic_years; return <option key={structure.id} value={structure.id}>{structure.name} · {year?.name}</option>; })}</Select></div>
          <div><Label htmlFor="apply_class_id">Class</Label><Select id="apply_class_id" name="class_id" defaultValue="" required><option value="" disabled>Choose class</option>{(classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
        </ActionForm>
      </Card>}

      <Card>
        <CardHeader><CardTitle>Structures ({structures?.length ?? 0} shown)</CardTitle></CardHeader>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-muted"><th className="px-3 py-2">Academic year</th><th className="px-3 py-2">Structure</th><th className="px-3 py-2">Class / level</th><th className="px-3 py-2">Fee items</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody>{(structures ?? []).map((structure) => {
            const year = Array.isArray(structure.academic_years) ? structure.academic_years[0] : structure.academic_years;
            const schoolClass = Array.isArray(structure.classes) ? structure.classes[0] : structure.classes;
            const level = Array.isArray(structure.education_levels) ? structure.education_levels[0] : structure.education_levels;
            const items = (structure.fee_structure_items ?? []) as { id: string; name: string; amount: number; installment_count: number; finance_fee_categories?: { name?: string } | null }[];
            return <tr key={structure.id} className="border-b border-line align-top"><td className="px-3 py-3">{year?.name ?? 'Unassigned'}</td><td className="px-3 py-3 font-medium">{structure.name}</td><td className="px-3 py-3">{schoolClass?.name ?? level?.name ?? 'All classes'}</td><td className="px-3 py-3">{items.map((item) => <div key={item.id}>{item.finance_fee_categories?.name ?? item.name} · {money(Number(item.amount))}{item.installment_count > 1 ? ` · ${item.installment_count} installments` : ''}</div>)}</td><td className="px-3 py-3 font-semibold">{money(Number(structure.amount))}</td><td className="px-3 py-3">{structure.active ? 'Active' : 'Inactive'}</td></tr>;
          })}</tbody>
        </table></div>
        {canManageStructures && <div className="mt-4 divide-y divide-line border-t border-line">{(structures ?? []).map((structure) => <div key={structure.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-ink">{structure.name} · {structure.active ? 'Active' : 'Inactive'}</span><ActionForm action={setFinanceFeeStructureActive} submitLabel={structure.active ? 'Deactivate' : 'Activate'} className="flex items-center gap-2"><input type="hidden" name="structure_id" value={structure.id} /><input type="hidden" name="active" value={structure.active ? 'false' : 'true'} /></ActionForm></div>)}</div>}
        {!structures?.length && <p className="help-text p-4">No fee structures yet.</p>}
      </Card>
    </div>
  );
}