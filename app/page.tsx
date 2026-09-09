import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const FEATURES = [
  { title: 'Students & classes', body: 'Admissions, class assignment, transfers and full student profiles in one place.' },
  { title: 'Attendance', body: 'Mark class attendance in a few taps — teachers see only their assigned classes.' },
  { title: 'Syllabus progress', body: 'Teachers log what they\u2019ve covered; administrators see who\u2019s behind schedule.' },
  { title: 'Exams & results', body: 'Marks entry, verification, grading and report cards — with your school\u2019s own grading scale.' },
  { title: 'Finance', body: 'Fee structures, payments and balances tracked cleanly by academic year.' },
  { title: 'Guardian communication', body: 'Send results and reminders over WhatsApp, with SMS as a fallback.' },
];

const BENEFITS = [
  'Every school gets its own isolated workspace — your data is never visible to another school.',
  'Permission-based access: give each staff member exactly the modules and actions they need.',
  'Built for non-technical staff — the common tasks take a few clicks, not five screens.',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand font-display text-sm text-white">
            ED
          </div>
          <span className="font-display text-lg font-medium text-ink">ElimuDira</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink">
            Login
          </Link>
          <Link href="/register">
            <Button size="sm">Register Your School</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-4 inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand-dark">
            A platform for many schools, not just one
          </p>
          <h1 className="font-display text-4xl font-medium leading-[1.1] text-ink md:text-5xl">
            One direction for every school to run itself, digitally.
          </h1>
          <p className="help-text mt-5 max-w-md text-base">
            ElimuDira gives your school its own secure workspace for students, staff, attendance, exams, finance
            and guardian communication — set up in minutes, not months.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/register">
              <Button size="lg">Register Your School</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">Login</Button>
            </Link>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <svg viewBox="0 0 320 320" className="w-full max-w-sm" aria-hidden="true">
            <circle cx="160" cy="160" r="140" fill="none" stroke="#DDE3E1" strokeWidth="1.5" />
            <circle cx="160" cy="160" r="100" fill="none" stroke="#DDE3E1" strokeWidth="1.5" />
            <circle cx="160" cy="160" r="60" fill="none" stroke="#E6F0EC" strokeWidth="1.5" />
            <line x1="160" y1="30" x2="160" y2="290" stroke="#DDE3E1" strokeWidth="1" />
            <line x1="30" y1="160" x2="290" y2="160" stroke="#DDE3E1" strokeWidth="1" />
            <polygon points="160,70 176,160 160,250 144,160" fill="#C88A2E" opacity="0.9" />
            <circle cx="160" cy="160" r="6" fill="#164F42" />
          </svg>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="mb-8 font-display text-2xl font-medium text-ink">Everything a school office actually does</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="mb-1 text-base font-semibold text-ink">{f.title}</h3>
              <p className="help-text">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="mb-6 font-display text-2xl font-medium text-ink">Built for many schools, from day one</h2>
        <ul className="space-y-3">
          {BENEFITS.map((b) => (
            <li key={b} className="flex gap-3 text-ink-soft">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {b}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="font-display text-2xl font-medium text-ink">Ready to bring your school online?</h2>
          <p className="help-text max-w-md">
            Registration takes a few minutes. Your setup wizard walks you through the rest.
          </p>
          <Link href="/register">
            <Button size="lg">Register Your School</Button>
          </Link>
        </Card>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted">
        ElimuDira — a multi-school education management platform.
      </footer>
    </div>
  );
}
