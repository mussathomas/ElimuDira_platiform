'use client';

import * as React from 'react';
import { ActionForm } from '@/components/ui/action-form';
import { Input } from '@/components/ui/input';
import { Label, Select, Textarea } from '@/components/ui/field';
import { recordFinancePayment } from '@/lib/actions/finance-ledger';

type ChargeOption = { id: string; description: string; balance: number; dueDate: string | null };
const money = (amount: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 2 }).format(amount);

export function FinancePaymentForm({
  studentId,
  academicYearId,
  charges,
}: {
  studentId: string;
  academicYearId: string;
  charges: ChargeOption[];
}) {
  const [allocationValues, setAllocationValues] = React.useState<Record<string, string>>({});
  const allocatedTotal = Object.values(allocationValues).reduce((total, value) => total + (Number(value) || 0), 0);

  return (
    <ActionForm action={recordFinancePayment} submitLabel="Record payment and issue receipt" className="space-y-5">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="academic_year_id" value={academicYearId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="payment_amount">Payment amount (TZS)</Label><Input id="payment_amount" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div><Label htmlFor="payment_date">Payment date</Label><Input id="payment_date" name="payment_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
        <div><Label htmlFor="payment_method">Method</Label><Select id="payment_method" name="method" defaultValue="cash"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile money</option><option value="other">Other</option></Select></div>
        <div><Label htmlFor="payment_reference">Reference number</Label><Input id="payment_reference" name="reference" maxLength={80} /></div>
      </div>
      <div>
        <Label htmlFor="payment_notes">Notes (optional)</Label>
        <Textarea id="payment_notes" name="notes" maxLength={240} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-4"><h3 className="text-sm font-semibold text-ink">Allocate to outstanding charges</h3><p className="text-sm font-medium text-ink">Allocated: {money(allocatedTotal)}</p></div>
        <div className="divide-y divide-line border-y border-line">
          {charges.map((charge) => (
            <div key={charge.id} className="grid items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div><p className="font-medium text-ink">{charge.description}</p><p className="help-text">Remaining {money(charge.balance)}{charge.dueDate ? ` · Due ${charge.dueDate}` : ''}</p></div>
              <div><Label htmlFor={`allocation-${charge.id}`}>Allocate (TZS)</Label><Input id={`allocation-${charge.id}`} name={`allocation:${charge.id}`} value={allocationValues[charge.id] ?? ''} onChange={(event) => setAllocationValues((current) => ({ ...current, [charge.id]: event.target.value }))} type="number" min="0" max={charge.balance} step="0.01" /></div>
            </div>
          ))}
          {!charges.length && <p className="help-text py-4">This student has no outstanding charges for the selected academic year.</p>}
        </div>
        <p className="help-text mt-2">The allocated total must equal the payment amount. A receipt number is issued once saved.</p>
      </div>
    </ActionForm>
  );
}