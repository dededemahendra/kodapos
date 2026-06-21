import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { Store } from 'lucide-react';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { FormSkeleton } from '~/components/ui/loading-skeletons';

export const Route = createFileRoute('/_pos/onboarding/profile')({
  component: OnboardingProfile,
});

function OnboardingProfile() {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const createForOwner = useMutation(api.cafes.createForOwner);
  const navigate = useNavigate();

  // A Google sign-up lands here authenticated but cafe-less (the inline
  // cafe-creation step only runs on the password signup form). Create a
  // default cafe so onboarding can proceed; createForOwner is idempotent.
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
        onSubmit={async (values) => {
          await updateProfile(values);
          navigate({ to: '/onboarding/menu', viewTransition: true });
        }}
        secondaryAction={{
          label: t`Lewati semua`,
          onClick: async () => {
            await markComplete();
            navigate({ to: '/menu' });
          },
        }}
      />
    </>
  );
}
