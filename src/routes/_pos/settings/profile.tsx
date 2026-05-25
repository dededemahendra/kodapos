import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { CafeProfileForm, type CafeProfileFormValues } from '~/components/menu/cafe-profile-form';

export const Route = createFileRoute('/_pos/settings/profile')({
  component: SettingsProfile,
});

function SettingsProfile() {
  const cafe = useQuery(api.cafes.myCafe);
  const updateProfile = useMutation(api.cafes.updateProfile);

  if (cafe === undefined) {
    return <p className="text-muted-foreground">Memuat…</p>;
  }
  if (cafe === null) {
    return <p className="text-muted-foreground">Kafe tidak ditemukan.</p>;
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
      <p className="text-muted-foreground mb-6 text-sm">Ubah informasi dasar kafe Anda.</p>
      <CafeProfileForm
        initial={initial}
        submitLabel="Simpan"
        onSubmit={async (values) => {
          await updateProfile(values);
        }}
      />
    </div>
  );
}
