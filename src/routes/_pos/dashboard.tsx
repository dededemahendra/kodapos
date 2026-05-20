import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { signOut } = useAuthActions();
  const greeting = useQuery(api.users.hello);
  const cafes = useQuery(api.cafes.mine);
  const createCafe = useMutation(api.cafes.createForOwner);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    await signOut();
    window.location.replace('/');
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSubmitting(true);
    try {
      const fd = new FormData(form);
      await createCafe({ name: String(fd.get('name') ?? '') });
      form.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Keluar
        </Button>
      </header>

      <section className="p-4 rounded-md bg-bg border border-border">
        {greeting === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : greeting === null ? (
          <p className="text-fg-muted">Belum login.</p>
        ) : (
          <p className="text-lg">{greeting}</p>
        )}
      </section>

      <section className="p-4 rounded-md bg-bg border border-border space-y-4">
        <h2 className="font-semibold">Kafe Saya</h2>
        {cafes === undefined ? (
          <p className="text-fg-muted">Memuat…</p>
        ) : cafes.length === 0 ? (
          <p className="text-fg-muted">Belum ada kafe.</p>
        ) : (
          <ul className="list-disc pl-5">
            {cafes.map((c) => (
              <li key={c._id}>{c.name}</li>
            ))}
          </ul>
        )}

        <form onSubmit={onCreate}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Nama Kafe</FieldLabel>
              <Input id="name" name="name" required />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Membuat…' : 'Buat'}
            </Button>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
