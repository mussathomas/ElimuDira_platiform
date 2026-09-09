'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

type Band = { min_score: number; max_score: number; grade_name: string; points: number | null; remark: string | null; passed: boolean };

export function GradingPreview({ bands }: { bands: Band[] }) {
  const [mark, setMark] = useState('76');
  const value = Number(mark);
  const band = bands.find((item) => value >= Number(item.min_score) && value <= Number(item.max_score));
  return <div className="grid gap-3 md:grid-cols-4"><div><label className="label-text" htmlFor="preview-mark">Sample mark</label><Input id="preview-mark" type="number" min="0" max="100" value={mark} onChange={(event) => setMark(event.target.value)} /></div><div><label className="label-text">Grade</label><p className="mt-2 font-semibold">{band?.grade_name ?? 'No matching range'}</p></div><div><label className="label-text">Point</label><p className="mt-2 font-semibold">{band?.points ?? '—'}</p></div><div><label className="label-text">Remark</label><p className="mt-2 font-semibold">{band?.remark ?? '—'}</p></div></div>;
}
