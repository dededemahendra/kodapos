import { useAuthActions } from '@convex-dev/auth/react';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AuthCard } from '~/components/auth/auth-card';
import { OrDivider } from '~/components/auth/or-divider';
import { OtpInput } from '~/components/auth/otp-input';
import { GoogleButton } from '~/components/auth/social-buttons';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { setRememberMe } from '~/lib/auth-storage';
import {
  validateEmail,
  validatePasswordRequired,
  validatePasswordSignup,
} from '~/lib/auth-validation';

// `email`/`code` no longer live in the query string: the magic link now carries
// them in the URL FRAGMENT (#) so they never reach a server log / Referer. Only
// `reset` remains a search param (it routes the card into reset mode).
type SigninSearch = { reset?: string };

export const Route = createFileRoute('/_public/signin')({
  validateSearch: (s: Record<string, unknown>): SigninSearch => ({
    ...(typeof s.reset === 'string' ? { reset: s.reset } : {}),
  }),
  component: SigninPage,
});

/**
 * Parse a magic-link fragment of the form `#email=<enc>&code=<token>`.
 * Returns null when either part is missing. A fragment is never sent to the
 * server (Finding 3), so the code does not leak via logs / Referer.
 */
function parseMagicLinkHash(hash: string): { email: string; code: string } | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const email = params.get('email');
  const code = params.get('code');
  if (!email || !code) return null;
  return { email, code };
}

type FieldState = { value: string; touched: boolean; error: MessageDescriptor | null };
const initialField: FieldState = { value: '', touched: false, error: null };

type Mode = 'password' | 'otp' | 'reset';
const RESEND_COOLDOWN_SECONDS = 30;

function SigninPage() {
  const search = Route.useSearch();
  // Magic link: email + code arrive in the URL fragment (never the query).
  const magic =
    typeof window !== 'undefined' ? parseMagicLinkHash(window.location.hash) : null;
  if (magic) {
    return <MagicLinkHandler email={magic.email} code={magic.code} />;
  }
  return <SigninCard initialMode={search.reset !== undefined ? 'reset' : 'password'} />;
}

/**
 * When the URL carries ?email=&code= (the magic link in the sign-in email),
 * auto-submit it. On success navigate into the app; on failure fall back to the
 * normal signin card with an error.
 */
function MagicLinkHandler({ email, code }: { email: string; code: string }) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        await signIn('resend-otp', { email, code });
        navigate({ to: '/dashboard' });
      } catch {
        setFailed(true);
      }
    })();
  }, [email, code, signIn, navigate]);

  if (failed) {
    return (
      <SigninCard
        initialMode="otp"
        initialError={t`Tautan masuk tidak valid atau sudah kedaluwarsa. Silakan coba lagi.`}
        prefillEmail={email}
      />
    );
  }

  return (
    <AuthCard>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Spinner className="size-6" />
        <p className="text-sm text-muted-foreground">
          <Trans>Memproses tautan masuk...</Trans>
        </p>
      </div>
    </AuthCard>
  );
}

function SigninCard({
  initialMode,
  initialError,
  prefillEmail,
}: {
  initialMode: Mode;
  initialError?: string;
  prefillEmail?: string;
}) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { t, i18n } = useLingui();

  const [mode, setMode] = useState<Mode>(initialMode);
  // Opt-in (Finding 6): default OFF so a shared register isn't remembered
  // unless the operator explicitly ticks the box.
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState<FieldState>(
    prefillEmail ? { value: prefillEmail, touched: false, error: null } : initialField,
  );
  const [password, setPassword] = useState<FieldState>(initialField);
  const [newPassword, setNewPassword] = useState<FieldState>(initialField);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Whether a code has been emailed (otp + reset modes share this gate).
  const [codeSent, setCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function rememberThenSignIn(): void {
    setRememberMe(remember);
  }

  function switchMode(next: Mode): void {
    setMode(next);
    setAuthError(null);
    setInfo(null);
    setCodeSent(false);
    setResetCode('');
    setCooldown(0);
    setPassword(initialField);
    setNewPassword(initialField);
  }

  // field handlers
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
  function handleNewPasswordBlur(_: FocusEvent<HTMLInputElement>): void {
    setNewPassword((prev) => ({
      ...prev,
      touched: true,
      error: validatePasswordSignup(prev.value),
    }));
  }
  function handleNewPasswordChange(e: ChangeEvent<HTMLInputElement>): void {
    const value = e.target.value;
    setNewPassword((prev) => ({
      ...prev,
      value,
      error: prev.touched ? validatePasswordSignup(value) : prev.error,
    }));
  }

  function onGoogle(): void {
    rememberThenSignIn();
    void signIn('google');
  }

  // password sign-in
  const passwordInvalid =
    email.error !== null ||
    password.error !== null ||
    email.value.length === 0 ||
    password.value.length === 0;

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const emailErr = validateEmail(email.value);
    const passwordErr = validatePasswordRequired(password.value);
    setEmail((prev) => ({ ...prev, touched: true, error: emailErr }));
    setPassword((prev) => ({ ...prev, touched: true, error: passwordErr }));
    if (emailErr !== null || passwordErr !== null) return;
    setSubmitting(true);
    setAuthError(null);
    try {
      rememberThenSignIn();
      await signIn('password', {
        flow: 'signIn',
        email: email.value.trim(),
        password: password.value,
      });
      navigate({ to: '/dashboard' });
    } catch {
      // Convex masks auth errors to a generic "Server Error"; show a friendly message.
      setAuthError(t`Email atau password salah.`);
    } finally {
      setSubmitting(false);
    }
  }

  // send a code (otp or reset)
  async function onSendCode(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const emailErr = validateEmail(email.value);
    setEmail((prev) => ({ ...prev, touched: true, error: emailErr }));
    if (emailErr !== null) return;
    setSubmitting(true);
    setAuthError(null);
    setInfo(null);
    try {
      if (mode === 'otp') {
        await signIn('resend-otp', { email: email.value.trim() });
      } else {
        await signIn('password', { flow: 'reset', email: email.value.trim() });
      }
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(t`Kode dikirim ke email Anda.`);
    } catch {
      // Resend not configured (or send failed) surfaces as a masked server error.
      setAuthError(
        t`Tidak dapat mengirim kode. Email mungkin belum dikonfigurasi. Coba masuk dengan sandi.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend(): Promise<void> {
    if (cooldown > 0 || submitting) return;
    setSubmitting(true);
    setAuthError(null);
    try {
      if (mode === 'otp') {
        await signIn('resend-otp', { email: email.value.trim() });
      } else {
        await signIn('password', { flow: 'reset', email: email.value.trim() });
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(t`Kode dikirim ulang.`);
    } catch {
      setAuthError(t`Tidak dapat mengirim ulang kode.`);
    } finally {
      setSubmitting(false);
    }
  }

  // verify passwordless code
  async function onOtpComplete(code: string): Promise<void> {
    setSubmitting(true);
    setAuthError(null);
    try {
      rememberThenSignIn();
      await signIn('resend-otp', { email: email.value.trim(), code });
      navigate({ to: '/dashboard' });
    } catch {
      setAuthError(t`Kode salah atau sudah kedaluwarsa.`);
    } finally {
      setSubmitting(false);
    }
  }

  // complete password reset
  async function onResetSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const newPwErr = validatePasswordSignup(newPassword.value);
    setNewPassword((prev) => ({ ...prev, touched: true, error: newPwErr }));
    if (newPwErr !== null) return;
    if (resetCode.length !== 8) {
      setAuthError(t`Masukkan kode 8 digit.`);
      return;
    }
    setSubmitting(true);
    setAuthError(null);
    try {
      rememberThenSignIn();
      await signIn('password', {
        flow: 'reset-verification',
        email: email.value.trim(),
        code: resetCode,
        newPassword: newPassword.value,
      });
      navigate({ to: '/dashboard' });
    } catch {
      setAuthError(t`Kode salah atau sudah kedaluwarsa.`);
    } finally {
      setSubmitting(false);
    }
  }

  const emailField = (autoFocus?: boolean) => (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <div className="relative">
        <Mail
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          // biome-ignore lint/a11y/noAutofocus: focusing the first field on a single-purpose auth card aids the keyboard flow
          autoFocus={autoFocus}
          placeholder="nama@email.com"
          className={`pl-9 ${email.error ? 'border-destructive' : ''}`}
          value={email.value}
          onBlur={handleEmailBlur}
          onChange={handleEmailChange}
          aria-invalid={email.error !== null}
          aria-describedby={email.error ? 'email-error' : undefined}
        />
      </div>
      {email.error && <FieldError id="email-error">{i18n._(email.error)}</FieldError>}
    </Field>
  );

  const title =
    mode === 'reset' ? (
      <Trans>Atur ulang sandi</Trans>
    ) : mode === 'otp' ? (
      <Trans>Masuk dengan kode</Trans>
    ) : (
      <Trans>Masuk ke akun</Trans>
    );

  return (
    <AuthCard title={title}>
      <GoogleButton onClick={onGoogle} disabled={submitting} />
      <OrDivider />

      {info && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
          {info}
        </p>
      )}

      {/* PASSWORD MODE */}
      {mode === 'password' && (
        <>
          <form onSubmit={onPasswordSubmit}>
            <FieldGroup>
              {emailField()}
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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
                    aria-label={showPassword ? t`Sembunyikan password` : t`Tampilkan password`}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {password.error && (
                  <FieldError id="password-error">{i18n._(password.error)}</FieldError>
                )}
              </Field>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(c) => setRemember(c === true)}
                  />
                  <Trans>Ingat saya di perangkat ini</Trans>
                </label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => switchMode('reset')}
                >
                  <Trans>Lupa sandi?</Trans>
                </Button>
              </div>

              {authError && <FieldError>{authError}</FieldError>}

              <Button type="submit" className="w-full" disabled={submitting || passwordInvalid}>
                {submitting && <Spinner data-icon="inline-start" />}
                {submitting ? <Trans>Memproses…</Trans> : <Trans>Masuk</Trans>}
              </Button>
            </FieldGroup>
          </form>

          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => switchMode('otp')}
            >
              <Trans>Masuk dengan kode</Trans>
            </Button>
          </div>
        </>
      )}

      {/* OTP MODE (passwordless) */}
      {mode === 'otp' && (
        <>
          {!codeSent ? (
            <form onSubmit={onSendCode}>
              <FieldGroup>
                {emailField(true)}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={remember} onCheckedChange={(c) => setRemember(c === true)} />
                  <Trans>Ingat saya di perangkat ini</Trans>
                </label>
                {authError && <FieldError>{authError}</FieldError>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || email.value.length === 0}
                >
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
                onComplete={(code) => void onOtpComplete(code)}
                errorMessage={authError ?? undefined}
                disabled={submitting}
              />
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => void onResend()}
                  disabled={cooldown > 0 || submitting}
                >
                  {cooldown > 0 ? (
                    <Trans>Kirim ulang kode ({cooldown}s)</Trans>
                  ) : (
                    <Trans>Kirim ulang kode</Trans>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => switchMode('password')}
            >
              <Trans>Pakai sandi</Trans>
            </Button>
          </div>
        </>
      )}

      {/* RESET MODE */}
      {mode === 'reset' && (
        <>
          {!codeSent ? (
            <form onSubmit={onSendCode}>
              <FieldGroup>
                {emailField(true)}
                {authError && <FieldError>{authError}</FieldError>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || email.value.length === 0}
                >
                  {submitting && <Spinner data-icon="inline-start" />}
                  <Trans>Kirim kode reset</Trans>
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={onResetSubmit}>
              <FieldGroup>
                <div className="space-y-2">
                  <p className="text-center text-sm text-muted-foreground">
                    <Trans>Masukkan kode</Trans>
                  </p>
                  <OtpInput digits={8} onComplete={setResetCode} disabled={submitting} />
                </div>
                <Field>
                  <FieldLabel htmlFor="new-password">
                    <Trans>Sandi baru</Trans>
                  </FieldLabel>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="new-password"
                      name="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={`pl-9 pr-9 ${newPassword.error ? 'border-destructive' : ''}`}
                      value={newPassword.value}
                      onBlur={handleNewPasswordBlur}
                      onChange={handleNewPasswordChange}
                      aria-invalid={newPassword.error !== null}
                      aria-describedby={newPassword.error ? 'new-password-error' : undefined}
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
                  {newPassword.error && (
                    <FieldError id="new-password-error">{i18n._(newPassword.error)}</FieldError>
                  )}
                </Field>
                {authError && <FieldError>{authError}</FieldError>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Spinner data-icon="inline-start" />}
                  <Trans>Atur ulang sandi</Trans>
                </Button>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => void onResend()}
                    disabled={cooldown > 0 || submitting}
                  >
                    {cooldown > 0 ? (
                      <Trans>Kirim ulang kode ({cooldown}s)</Trans>
                    ) : (
                      <Trans>Kirim ulang kode</Trans>
                    )}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          )}

          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => switchMode('password')}
            >
              <Trans>Kembali</Trans>
            </Button>
          </div>
        </>
      )}

      <div className="mt-6 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        <Trans>Belum punya akun?</Trans>{' '}
        <Link to="/signup" className="text-primary underline">
          <Trans>Daftar</Trans>
        </Link>
      </div>
    </AuthCard>
  );
}
