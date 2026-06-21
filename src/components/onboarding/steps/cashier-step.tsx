import { Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { type FormEvent, useState } from 'react';
import { KeyRound, Plus, Users } from 'lucide-react';
import { PinEntry } from '~/components/staff/pin-entry';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { FormSkeleton } from '~/components/ui/loading-skeletons';
import { Spinner } from '~/components/ui/spinner';

export function CashierStep() {
  const { t } = useLingui();
  const staff = useQuery(api.staff.list, {});
  const create = useMutation(api.staff.create);
  const resetPin = useMutation(api.staff.resetPin);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();
  const [pickingOwner, setPickingOwner] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (staff === undefined) return <FormSkeleton rows={4} />;

  const owner = staff.find((s) => s.role === 'owner');
  const cashiers = staff.filter((s) => s.role === 'cashier');

  async function handleSetOwnerPin(pin: string): Promise<void> {
    if (!owner) return;
    setPinError(null);
    try {
      await resetPin({ id: owner._id, pin });
      setPickingOwner(false);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : t`Gagal mengatur PIN.`);
    }
  }

  async function handleAddCashier(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create({
        name: String(fd.get('name') ?? ''),
        pin: String(fd.get('pin') ?? ''),
      });
      form.reset();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t`Gagal menambah kasir.`);
    } finally {
      setAdding(false);
    }
  }

  async function finish(): Promise<void> {
    await markComplete();
    navigate({ to: '/menu' });
  }

  return (
    <div className="space-y-8">
      <OnboardingStepHeader
        icon={<Users />}
        title={<Trans>PIN Pemilik & Kasir</Trans>}
        description={
          <Trans>Atur PIN 4 digit untuk Anda. Anda juga bisa menambahkan kasir tambahan (opsional).</Trans>
        }
      />

      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          <Trans>PIN Pemilik</Trans>
        </h2>
        {owner && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <KeyRound className="size-4 text-muted-foreground" />
              <span className="font-medium">{owner.name}</span>
            </div>
            <Button
              variant={owner.pinHash ? 'outline' : 'default'}
              onClick={() => setPickingOwner(true)}
            >
              {owner.pinHash ? <Trans>Ganti PIN</Trans> : <Trans>Atur PIN</Trans>}
            </Button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          <Trans>Kasir lain (opsional)</Trans>
        </h2>
        <form onSubmit={handleAddCashier} className="flex gap-2 items-end mb-3">
          <Field className="flex-1">
            <FieldLabel htmlFor="cName"><Trans>Nama</Trans></FieldLabel>
            <Input id="cName" name="name" placeholder={t`mis. Andi`} required maxLength={60} />
          </Field>
          <Field className="w-32">
            <FieldLabel htmlFor="cPin"><Trans>PIN 4 digit</Trans></FieldLabel>
            <Input
              id="cPin"
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
            />
          </Field>
          <Button type="submit" disabled={adding}>
            {adding ? <Spinner data-icon="inline-start" /> : <Plus />}
            {adding ? <Trans>…</Trans> : <Trans>Tambah</Trans>}
          </Button>
        </form>
        {addError && <FieldError>{addError}</FieldError>}
        {cashiers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            <Trans>Belum ada kasir tambahan.</Trans>
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {cashiers.map((c) => (
              <li key={c._id} className="flex items-center gap-2 p-3 text-sm">
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <Button onClick={() => void finish()}><Trans>Selesai</Trans></Button>
        <Button asChild variant="ghost" className="text-muted-foreground">
          <Link to="/onboarding/menu"><Trans>← Kembali</Trans></Link>
        </Button>
      </div>

      <Dialog open={pickingOwner} onOpenChange={(o) => !o && setPickingOwner(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><Trans>Atur PIN Pemilik</Trans></DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void handleSetOwnerPin(pin);
            }}
            {...(pinError ? { errorMessage: pinError } : {})}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
