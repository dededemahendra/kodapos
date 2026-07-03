import { useAuthActions } from '@convex-dev/auth/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { AuthCard } from '~/components/auth/auth-card';
import { OtpInput } from '~/components/auth/otp-input';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { validateEmail } from '~/lib/auth-validation';

export const Route = createFileRoute('/_admin/login')({
  component: OperatorLogin,
});

function OperatorLogin() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { t, i18n } = useLingui();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    if (emailErr !== null) {
      setError(i18n._(emailErr));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn('resend-otp', { email: email.trim() });
      setSent(true);
    } catch {
      setError(t`Tidak dapat mengirim kode.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function onComplete(code: string) {
    setSubmitting(true);
    setError(null);
    try {
      await signIn('resend-otp', { email: email.trim(), code });
      navigate({ to: '/overview' });
    } catch {
      setError(t`Kode salah atau sudah kedaluwarsa.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title={<Trans>Masuk operator</Trans>}>
      {!sent ? (
        <form onSubmit={onSend}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t`nama@email.com`}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" className="w-full" disabled={submitting || email.length === 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              <Trans>Kirim kode</Trans>
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            <Trans>Masukkan kode</Trans>
          </p>
          <OtpInput
            digits={8}
            onComplete={(code) => void onComplete(code)}
            errorMessage={error ?? undefined}
            disabled={submitting}
          />
        </div>
      )}
    </AuthCard>
  );
}
