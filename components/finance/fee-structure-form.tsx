'use client';

import * as React from 'react';
import { ActionForm } from '@/components/ui/action-form';
import { Input } from '@/components/ui/input';
import { Label, Select } from '@/components/ui/field';
import { createFinanceFeeStructure } from '@/lib/actions/finance-ledger';

type FeeCategoryOption = { id: string; name: string };
type Option = { id: string; name: string };
type FeeItemDraft = { category_id: string; name: string; amount: string; due_date: string; installment_count: string };

const emptyItem = (): FeeItemDraft => ({ category_id: '', name: '', amount: '', due_date: '', installment_count: '1' });

export function FeeStructureForm({
  years,
  classes,
  educationLevels,
  categories,
  initialYearId,
}: {
  years: (Option & { is_current: boolean })[];
  classes: Option[];
  educationLevels: Option[];
  categories: FeeCategoryOption[];
  initialYearId: string;
}) {
  const [items, setItems] = React.useState<FeeItemDraft[]>([emptyItem()]);
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const updateItem = (index: number, patch: Partial<FeeItemDraft>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <ActionForm action={createFinanceFeeStructure} submitLabel="Save fee structure" className="space-y-5" resetOnSuccess={false}>
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="structure_name">Structure name</Label><Input id="structure_name" name="name" placeholder="Form 2 standard fees" required maxLength={120} /></div>
        <div><Label htmlFor="structure_year">Academic year</Label><Select id="structure_year" name="academic_year_id" defaultValue={initialYearId} required><option value="">Choose year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (current)' : ''}</option>)}</Select></div>
        <div><Label htmlFor="structure_class">Class (optional)</Label><Select id="structure_class" name="class_id" defaultValue=""><option value="">Any class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
        <div><Label htmlFor="structure_level">Education level (optional)</Label><Select id="structure_level" name="education_level_id" defaultValue=""><option value="">Any level</option>{educationLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Fee items</h3>
          <button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-ink">Add item</button>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5">
              <div><Label htmlFor={`item-category-${index}`}>Category</Label><Select id={`item-category-${index}`} value={item.category_id} onChange={(event) => updateItem(index, { category_id: event.target.value })} required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></div>
              <div><Label htmlFor={`item-name-${index}`}>Charge name</Label><Input id={`item-name-${index}`} value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} required maxLength={100} /></div>
              <div><Label htmlFor={`item-amount-${index}`}>Amount (TZS)</Label><Input id={`item-amount-${index}`} value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} type="number" min="0.01" step="0.01" required /></div>
              <div><Label htmlFor={`item-due-${index}`}>First due date</Label><Input id={`item-due-${index}`} value={item.due_date} onChange={(event) => updateItem(index, { due_date: event.target.value })} type="date" /></div>
              <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><Label htmlFor={`item-installments-${index}`}>Installments</Label><Input id={`item-installments-${index}`} value={item.installment_count} onChange={(event) => updateItem(index, { installment_count: event.target.value })} type="number" min="1" max="24" step="1" required /></div>{items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove fee item" className="mb-0.5 h-10 rounded-md border border-border px-3 text-sm text-ink-soft">Remove</button>}</div>
            </div>
          ))}
        </div>
        <p className="text-right text-sm font-semibold text-ink">Structure total: {new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(total)}</p>
      </div>
    </ActionForm>
  );
}