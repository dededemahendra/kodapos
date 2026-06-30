import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Store, User } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { FormSkeleton } from '~/components/ui/loading-skeletons';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';

export function ProfileStep() {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe);
  const savedName = useQuery(api.users.myName);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const setName = useMutation(api.users.setName);
  const createForOwner = useMutation(api.cafes.createForOwner);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const [ownerName, setOwnerName] = useState('');
  const [agreed, setAgreed] = useState(false);

  // Pre-fill the owner name once it loads (Google users have one; OTP users do not).
  useEffect(() => {
    if (typeof savedName === 'string' && savedName.length > 0) setOwnerName(savedName);
  }, [savedName]);

  // A passwordless / Google sign-up lands here authenticated but cafe-less.
  // Create a default cafe so onboarding can proceed; createForOwner is idempotent.
  const creating = useRef(false);
  useEffect(() => {
    if (cafe !== null || creating.current) return;
    creating.current = true;
    void createForOwner({ name: 'Kafe Saya' }).catch(() => {
      creating.current = false;
    });
  }, [cafe, createForOwner]);

  if (cafe === undefined || cafe === null) {
    return <FormSkeleton rows={5} />;
  }

  const initial: CafeProfileFormValues = {
    name: cafe.name,
    timezone: cafe.timezone ?? 'Asia/Jakarta',
    taxRatePct: cafe.taxRatePct ?? 11,
    taxEnabled: cafe.taxEnabled ?? true,
  };
  if (cafe.phone) initial.phone = cafe.phone;
  if (cafe.addressLine) initial.addressLine = cafe.addressLine;

  const ownerNameTrimmed = ownerName.trim();
  const gateBlocked = ownerNameTrimmed.length < 1 || !agreed;

  const prepend = (
    <>
      <Field>
        <FieldLabel htmlFor="ownerName"><Trans>Nama Anda</Trans></FieldLabel>
        <div className="relative">
          <User
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="ownerName"
            name="ownerName"
            autoComplete="name"
            placeholder={t`mis. Warren`}
            className="pl-9"
            maxLength={80}
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
        </div>
      </Field>
      <div className="flex items-start gap-2">
        <Checkbox
          id="agreedCheckbox"
          checked={agreed}
          onCheckedChange={(c) => setAgreed(c === true)}
          className="mt-0.5"
        />
        <label htmlFor="agreedCheckbox" className="text-sm text-muted-foreground select-none">
          <Trans>
            Saya menyetujui{' '}
            <Link to="/terms" className="text-primary underline">Syarat Layanan</Link>{' '}
            dan{' '}
            <Link to="/privacy" className="text-primary underline">Kebijakan Privasi</Link>.
          </Trans>
        </label>
      </div>
    </>
  );

  return (
    <>
      <OnboardingStepHeader
        icon={<Store />}
        title={<Trans>Profil kafe</Trans>}
        description={<Trans>Bisa diubah kapan saja di Pengaturan.</Trans>}
      />
      <CafeProfileForm
        initial={initial}
        submitLabel={t`Lanjut →`}
        prepend={prepend}
        disableSubmit={gateBlocked}
        onSubmit={async (values) => {
          await setName({ name: ownerNameTrimmed });
          await updateProfile({ ...values, ownerTermsAcceptedAt: Date.now() });
          navigate({ to: '/onboarding/menu' });
        }}
        secondaryAction={{
          label: t`Lewati semua`,
          onClick: async () => {
            if (gateBlocked) return;
            try {
              await setName({ name: ownerNameTrimmed });
              await updateProfile({ ...initial, ownerTermsAcceptedAt: Date.now() });
              await markComplete();
              navigate({ to: '/menu' });
            } catch (err) {
              console.error('Onboarding skip failed', err);
            }
          },
        }}
      />
      <div className="mt-6 text-center">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm text-muted-foreground"
          onClick={() => {
            void signOut().then(() => window.location.replace('/'));
          }}
        >
          <Trans>Bukan bisnis Anda? Keluar</Trans>
        </Button>
      </div>
    </>
  );
}
