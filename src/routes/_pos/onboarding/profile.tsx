import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';

export const Route = createFileRoute('/_pos/onboarding/profile')({
  component: OnboardingProfile,
});

function OnboardingProfile() {
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  if (cafe === undefined) {
    return <p className="text-fg-muted">Memuat…</p>;
  }
  if (cafe === null) {
    return <p className="text-fg-muted">Kafe tidak ditemukan.</p>;
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
      <h1 className="text-2xl font-bold mb-1">Profil kafe</h1>
      <p className="text-fg-muted mb-6 text-sm">Bisa diubah kapan saja di Pengaturan.</p>
      <CafeProfileForm
        initial={initial}
        submitLabel="Lanjut →"
        onSubmit={async (values) => {
          await updateProfile(values);
          // Next onboarding step (`/onboarding/menu`) lands in a later task; use string nav until then.
          navigate({ to: '/onboarding/menu' as never });
        }}
        secondaryAction={{
          label: 'Lewati semua',
          onClick: async () => {
            await markComplete();
            // `/menu` arrives in a later task; cast until the route exists.
            navigate({ to: '/menu' as never });
          },
        }}
      />
    </div>
  );
}
