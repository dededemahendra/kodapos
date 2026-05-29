import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useConvex, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import { StaffPickerCard } from '~/components/staff/staff-picker-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/pin')({
  component: PinPickerPage,
});

function PinPickerPage() {
  const { t } = useLingui();
  const staff = useQuery(api.staff.list, {});
  const convex = useConvex();
  const { setCashier } = useActiveCashier();
  const navigate = useNavigate();
  const [picking, setPicking] = useState<{
    id: Id<'cafeStaff'>;
    name: string;
    hasPin: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (staff === undefined) {
    return <p className="text-muted-foreground p-6"><Trans>Memuat…</Trans></p>;
  }

  async function selectWithoutPin(id: Id<'cafeStaff'>): Promise<void> {
    setCashier(id);
    navigate({ to: '/shift/open' });
  }

  async function selectWithPin(pin: string): Promise<void> {
    if (!picking) return;
    const ok = await convex.query(api.staff.verifyPin, { id: picking.id, pin });
    if (!ok) {
      setError(t`PIN salah.`);
      return;
    }
    setCashier(picking.id);
    setPicking(null);
    navigate({ to: '/shift/open' });
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1"><Trans>Siapa yang bertugas?</Trans></h1>
      <p className="text-muted-foreground text-sm mb-6"><Trans>Pilih nama Anda dan masukkan PIN 4 digit.</Trans></p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {staff.map((s) => (
          <StaffPickerCard
            key={s._id}
            name={s.name}
            role={s.role}
            hasPin={!!s.pinHash}
            onClick={() => {
              setError(null);
              if (!s.pinHash) {
                void selectWithoutPin(s._id);
              } else {
                setPicking({ id: s._id, name: s.name, hasPin: true });
              }
            }}
          />
        ))}
      </div>

      <Dialog open={!!picking} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Trans>PIN untuk {picking?.name}</Trans></DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void selectWithPin(pin);
            }}
            {...(error ? { errorMessage: error } : {})}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
