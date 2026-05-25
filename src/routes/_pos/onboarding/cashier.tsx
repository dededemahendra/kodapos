import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { PinEntry } from '~/components/staff/pin-entry';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/onboarding/cashier')({
  component: OnboardingCashier,
});

function OnboardingCashier() {
  const staff = useQuery(api.staff.list, {});
  const create = useMutation(api.staff.create);
  const resetPin = useMutation(api.staff.resetPin);
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();
  const [pickingOwner, setPickingOwner] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (staff === undefined) return <p className="text-muted-foreground">Memuat…</p>;

  const owner = staff.find((s) => s.role === 'owner');
  const cashiers = staff.filter((s) => s.role === 'cashier');

  async function handleSetOwnerPin(pin: string): Promise<void> {
    if (!owner) return;
    setPinError(null);
    try {
      await resetPin({ id: owner._id, pin });
      setPickingOwner(false);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Gagal mengatur PIN.');
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
      setAddError(err instanceof Error ? err.message : 'Gagal menambah kasir.');
    } finally {
      setAdding(false);
    }
  }

  async function finish(): Promise<void> {
    await markComplete();
    navigate({ to: '/menu' });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">PIN Pemilik & Kasir</h1>
        <p className="text-muted-foreground text-sm">
          Atur PIN 4 digit untuk Anda. Anda juga bisa menambahkan kasir tambahan (opsional).
        </p>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">PIN Pemilik</h2>
        {owner && (
          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-background">
            <span>{owner.name}</span>
            <Button
              variant={owner.pinHash ? 'outline' : 'default'}
              onClick={() => setPickingOwner(true)}
            >
              {owner.pinHash ? 'Ganti PIN' : 'Atur PIN'}
            </Button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Kasir lain (opsional)
        </h2>
        <form onSubmit={handleAddCashier} className="flex gap-2 items-end mb-3">
          <div className="flex-1">
            <label htmlFor="cName" className="text-xs text-muted-foreground">
              Nama
            </label>
            <Input id="cName" name="name" placeholder="mis. Andi" required maxLength={60} />
          </div>
          <div>
            <label htmlFor="cPin" className="text-xs text-muted-foreground">
              PIN 4 digit
            </label>
            <Input
              id="cPin"
              name="pin"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
            />
          </div>
          <Button type="submit" disabled={adding}>
            {adding && <Spinner data-icon="inline-start" />}
            {adding ? '…' : '+ Tambah'}
          </Button>
        </form>
        {addError && <p className="text-sm text-destructive mb-2">{addError}</p>}
        {cashiers.length > 0 && (
          <ul className="text-sm space-y-1">
            {cashiers.map((c) => (
              <li key={c._id}>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <Button onClick={() => void finish()}>Selesai</Button>
        <Button asChild variant="ghost">
          <Link to="/onboarding/menu">← Kembali</Link>
        </Button>
      </div>

      <Dialog open={pickingOwner} onOpenChange={(o) => !o && setPickingOwner(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur PIN Pemilik</DialogTitle>
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
