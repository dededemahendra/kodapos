import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';

export const Route = createFileRoute('/_pos/onboarding/profile')({
  component: OnboardingProfile,
});

function OnboardingProfile() {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  if (cafe === undefined) {
    return <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>;
  }
  if (cafe === null) {
    return <p className="text-muted-foreground"><Trans>Kafe tidak ditemukan.</Trans></p>;
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
    <div>
      <h1 className="text-2xl font-bold mb-1"><Trans>Profil kafe</Trans></h1>
      <p className="text-muted-foreground mb-6 text-sm"><Trans>Bisa diubah kapan saja di Pengaturan.</Trans></p>
      <CafeProfileForm
        initial={initial}
        submitLabel={t`Lanjut →`}
        onSubmit={async (values) => {
          await updateProfile(values);
          navigate({ to: '/onboarding/menu' });
        }}
        secondaryAction={{
          label: t`Lewati semua`,
          onClick: async () => {
            await markComplete();
            navigate({ to: '/menu' });
          },
        }}
      />
    </div>
  );
}
