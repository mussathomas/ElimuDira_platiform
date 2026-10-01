'use client';

export function PrintStatementButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-ink print:hidden">Print</button>;
}