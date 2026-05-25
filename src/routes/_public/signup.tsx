import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useConvex } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_public/signup')({
  component: SignupPage,
});

async function createCafeWhenAuthReady(
  convex: ReturnType<typeof useConvex>,
  cafeName: string
): Promise<void> {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await convex.mutation(api.cafes.createForOwner, { name: cafeName });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuthRace = message.includes('not authenticated');
      if (!isAuthRace || attempt === maxAttempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

function SignupPage() {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const ownerName = String(fd.get('name') ?? '').trim();
      const cafeName = String(fd.get('cafeName') ?? '').trim();
      await signIn('password', {
        flow: 'signUp',
        email: String(fd.get('email') ?? ''),
        password: String(fd.get('password') ?? ''),
        name: ownerName,
      });
      // Convex Auth's signIn returns when the server accepts credentials,
      // but the new auth token takes a beat to propagate into the React
      // client. Retry until createForOwner sees the identity (cap at ~3s).
      await createCafeWhenAuthReady(convex, cafeName);
      navigate({ to: '/onboarding/profile' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm p-6 rounded-lg border border-border bg-background"
      >
        <h1 className="mb-6 text-2xl font-bold">Daftar</h1>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Nama Anda</FieldLabel>
            <Input id="name" name="name" required autoComplete="name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="cafeName">Nama kafe</FieldLabel>
            <Input
              id="cafeName"
              name="cafeName"
              required
              maxLength={80}
              autoComplete="organization"
              placeholder="mis. Kopi Senja"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Memproses…' : 'Daftar'}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
