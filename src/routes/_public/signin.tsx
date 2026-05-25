import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  useState,
} from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { validateEmail, validatePasswordRequired } from '~/lib/auth-validation';

export const Route = createFileRoute('/_public/signin')({
  component: SigninPage,
});

type FieldState = { value: string; touched: boolean; error: string | null };

const initialField: FieldState = { value: '', touched: false, error: null };

function SigninPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [email, setEmail] = useState<FieldState>(initialField);
  const [password, setPassword] = useState<FieldState>(initialField);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleEmailBlur(_: FocusEvent<HTMLInputElement>): void {
    setEmail((prev) => ({ ...prev, touched: true, error: validateEmail(prev.value) }));
  }
  function handleEmailChange(e: ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value;
    setEmail((prev) => ({
      ...prev,
      value,
      error: prev.touched ? validateEmail(value) : prev.error,
    }));
  }
  function handlePasswordBlur(_: FocusEvent<HTMLInputElement>): void {
    setPassword((prev) => ({
      ...prev,
      touched: true,
      error: validatePasswordRequired(prev.value),
    }));
  }
  function handlePasswordChange(e: ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value;
    setPassword((prev) => ({
      ...prev,
      value,
      error: prev.touched ? validatePasswordRequired(value) : prev.error,
    }));
  }

  const formInvalid =
    email.error !== null ||
    password.error !== null ||
    email.value.length === 0 ||
    password.value.length === 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const emailErr = validateEmail(email.value);
    const passwordErr = validatePasswordRequired(password.value);
    setEmail((prev) => ({ ...prev, touched: true, error: emailErr }));
    setPassword((prev) => ({ ...prev, touched: true, error: passwordErr }));
    if (emailErr !== null || passwordErr !== null) return;
    setSubmitting(true);
    setAuthError(null);
    try {
      await signIn('password', {
        flow: 'signIn',
        email: email.value.trim(),
        password: password.value,
      });
      navigate({ to: '/menu' });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Email atau password salah.');
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
        <h1 className="mb-6 text-2xl font-bold">Masuk</h1>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nama@email.com"
                className={`pl-9 ${email.error ? 'border-destructive' : ''}`}
                value={email.value}
                onBlur={handleEmailBlur}
                onChange={handleEmailChange}
                aria-invalid={email.error !== null}
                aria-describedby={email.error ? 'email-error' : undefined}
              />
            </div>
            {email.error && <FieldError id="email-error">{email.error}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`pl-9 pr-9 ${password.error ? 'border-destructive' : ''}`}
                value={password.value}
                onBlur={handlePasswordBlur}
                onChange={handlePasswordChange}
                aria-invalid={password.error !== null}
                aria-describedby={password.error ? 'password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {password.error && <FieldError id="password-error">{password.error}</FieldError>}
          </Field>

          {authError && <FieldError>{authError}</FieldError>}

          <Button type="submit" className="w-full" disabled={submitting || formInvalid}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Memproses…' : 'Masuk'}
          </Button>
        </FieldGroup>

        <div className="mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
          Belum punya akun?{' '}
          <Link to="/signup" className="text-primary underline">
            Daftar
          </Link>
        </div>
      </form>
    </main>
  );
}
