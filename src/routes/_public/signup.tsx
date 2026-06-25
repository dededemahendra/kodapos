import { useAuthActions } from '@convex-dev/auth/react';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useConvex } from 'convex/react';
import { Coffee, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  useMemo,
  useState,
} from 'react';
import { AuthCard } from '~/components/auth/auth-card';
import { OrDivider } from '~/components/auth/or-divider';
import { GoogleButton } from '~/components/auth/social-buttons';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { setRememberMe } from '~/lib/auth-storage';
import {
  passwordStrength,
  validateCafeName,
  validateEmail,
  validateName,
  validatePasswordSignup,
} from '~/lib/auth-validation';
import { seo } from '~/lib/seo';

export const Route = createFileRoute('/_public/signup')({
  head: () =>
    seo({
      title: 'Daftar gratis, kodapos',
      description: 'Buat akun kodapos gratis dan mulai berjualan. Tanpa kartu kredit.',
      path: '/signup',
      noindex: true,
    }),
  component: SignupPage,
});

type FieldState = { value: string; touched: boolean; error: MessageDescriptor | null };
const initialField: FieldState = { value: '', touched: false, error: null };

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
  const { t, i18n } = useLingui();

  const [name, setName] = useState<FieldState>(initialField);
  const [cafeName, setCafeName] = useState<FieldState>(initialField);
  const [email, setEmail] = useState<FieldState>(initialField);
  const [password, setPassword] = useState<FieldState>(initialField);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => passwordStrength(password.value), [password.value]);

  function bindBlur(
    setter: React.Dispatch<React.SetStateAction<FieldState>>,
    validator: (value: string) => MessageDescriptor | null
  ) {
    return (_: FocusEvent<HTMLInputElement>) => {
      setter((prev) => ({ ...prev, touched: true, error: validator(prev.value) }));
    };
  }
  function bindChange(
    setter: React.Dispatch<React.SetStateAction<FieldState>>,
    validator: (value: string) => MessageDescriptor | null
  ) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setter((prev) => ({
        ...prev,
        value,
        error: prev.touched ? validator(value) : prev.error,
      }));
    };
  }

  const formInvalid =
    name.error !== null ||
    cafeName.error !== null ||
    email.error !== null ||
    password.error !== null ||
    name.value.length === 0 ||
    cafeName.value.length === 0 ||
    email.value.length === 0 ||
    password.value.length === 0 ||
    !agreed;

  function onGoogle(): void {
    // Google signups can't run the cafe-creation step inline; the post-auth
    // OnboardingGate routes a cafe-less authenticated user into onboarding.
    setRememberMe(true);
    void signIn('google');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const nameErr = validateName(name.value);
    const cafeErr = validateCafeName(cafeName.value);
    const emailErr = validateEmail(email.value);
    const passwordErr = validatePasswordSignup(password.value);
    setName((prev) => ({ ...prev, touched: true, error: nameErr }));
    setCafeName((prev) => ({ ...prev, touched: true, error: cafeErr }));
    setEmail((prev) => ({ ...prev, touched: true, error: emailErr }));
    setPassword((prev) => ({ ...prev, touched: true, error: passwordErr }));
    if (nameErr || cafeErr || emailErr || passwordErr || !agreed) return;
    setSubmitting(true);
    setAuthError(null);
    try {
      setRememberMe(true);
      // Step 1: create the account. This IS the signup. If it throws, no account
      // was created (or the email already exists), so surface the error and stop.
      try {
        await signIn('password', {
          flow: 'signUp',
          email: email.value.trim(),
          password: password.value,
          name: name.value.trim(),
        });
      } catch {
        // signUp failures (e.g. email already registered) surface as a masked
        // "Server Error" on the client; show a friendly message instead.
        setAuthError(t`Gagal mendaftar.`);
        return;
      }
      // Step 2: create the cafe inline as a best effort. The account already
      // exists now, so a failure here (most often the auth-token propagation
      // race that throws "not authenticated") must NOT fail the whole signup and
      // orphan the account. The post-auth OnboardingGate routes the signed-in,
      // cafe-less user into onboarding to finish setup, the same path Google
      // signups already rely on.
      try {
        await createCafeWhenAuthReady(convex, cafeName.value.trim());
      } catch {
        // intentionally ignored; onboarding creates the cafe for a cafe-less user
      }
      navigate({ to: '/onboarding/profile' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title={<Trans>Buat akun</Trans>}>
      <GoogleButton onClick={onGoogle} disabled={submitting} />
      <OrDivider />

      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name"><Trans>Nama Anda</Trans></FieldLabel>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder={t`mis. Warren`}
                className={`pl-9 ${name.error ? 'border-destructive' : ''}`}
                value={name.value}
                onBlur={bindBlur(setName, validateName)}
                onChange={bindChange(setName, validateName)}
                aria-invalid={name.error !== null}
                aria-describedby={name.error ? 'name-error' : undefined}
              />
            </div>
            {name.error && <FieldError id="name-error">{i18n._(name.error)}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="cafeName"><Trans>Nama kafe</Trans></FieldLabel>
            <div className="relative">
              <Coffee
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="cafeName"
                name="cafeName"
                autoComplete="organization"
                placeholder={t`mis. Kopi Senja`}
                maxLength={80}
                className={`pl-9 ${cafeName.error ? 'border-destructive' : ''}`}
                value={cafeName.value}
                onBlur={bindBlur(setCafeName, validateCafeName)}
                onChange={bindChange(setCafeName, validateCafeName)}
                aria-invalid={cafeName.error !== null}
                aria-describedby={cafeName.error ? 'cafeName-error' : undefined}
              />
            </div>
            {cafeName.error && <FieldError id="cafeName-error">{i18n._(cafeName.error)}</FieldError>}
          </Field>

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
                onBlur={bindBlur(setEmail, validateEmail)}
                onChange={bindChange(setEmail, validateEmail)}
                aria-invalid={email.error !== null}
                aria-describedby={email.error ? 'email-error' : undefined}
              />
            </div>
            {email.error && <FieldError id="email-error">{i18n._(email.error)}</FieldError>}
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
                autoComplete="new-password"
                placeholder={t`Minimal 8 karakter`}
                className={`pl-9 pr-9 ${password.error ? 'border-destructive' : ''}`}
                value={password.value}
                onBlur={bindBlur(setPassword, validatePasswordSignup)}
                onChange={bindChange(setPassword, validatePasswordSignup)}
                aria-invalid={password.error !== null}
                aria-describedby={password.error ? 'password-error' : 'password-strength'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? t`Sembunyikan password` : t`Tampilkan password`}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {password.value.length > 0 && (
              <div id="password-strength" className="mt-1.5">
                <div className="h-1 w-full bg-muted rounded">
                  <div
                    className="h-1 bg-foreground rounded transition-all duration-200"
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                {strength.label && (
                  <p className="mt-1 text-xs text-muted-foreground">{i18n._(strength.label)}</p>
                )}
              </div>
            )}
            {password.error && <FieldError id="password-error">{i18n._(password.error)}</FieldError>}
          </Field>

          <div className="flex items-start gap-2">
            <Checkbox
              id="terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor="terms" className="text-sm text-muted-foreground select-none">
              <Trans>
                Saya menyetujui{' '}
                <Link to="/terms" className="text-primary underline">
                  Syarat Layanan
                </Link>{' '}
                dan{' '}
                <Link to="/privacy" className="text-primary underline">
                  Kebijakan Privasi
                </Link>
                .
              </Trans>
            </label>
          </div>

          {authError && <FieldError>{authError}</FieldError>}

          <Button type="submit" className="w-full" disabled={submitting || formInvalid}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Daftar</Trans>}
          </Button>
        </FieldGroup>
      </form>

      <div className="mt-6 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <Trans>Sudah punya akun?</Trans>{' '}
        <Link to="/signin" className="text-primary underline">
          <Trans>Masuk</Trans>
        </Link>
      </div>
    </AuthCard>
  );
}
