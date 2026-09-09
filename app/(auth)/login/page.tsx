'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { loginUser, type LoginResult } from '@/lib/actions/login';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginResult | null, FormData>(loginUser, null);

  return (
    <Card>
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Sign in</h1>
      <p className="help-text mb-6">Welcome back to your ElimuDira workspace.</p>

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="help-text mt-6 text-center">
        New to ElimuDira?{' '}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Register your school
        </Link>
      </p>
    </Card>
  );
}
