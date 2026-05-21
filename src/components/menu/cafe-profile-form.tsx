import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface CafeProfileFormValues {
  name: string;
  phone?: string;
  addressLine?: string;
  timezone: string;
  taxRatePct: number;
  taxEnabled: boolean;
}

export interface CafeProfileFormProps {
  initial: CafeProfileFormValues;
  submitLabel: string;
  onSubmit: (values: CafeProfileFormValues) => Promise<void>;
  secondaryAction?: { label: string; onClick: () => void };
}

export function CafeProfileForm({
  initial,
  submitLabel,
  onSubmit,
  secondaryAction,
}: CafeProfileFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const phone = String(fd.get('phone') ?? '').trim();
    const addressLine = String(fd.get('addressLine') ?? '').trim();
    const values: CafeProfileFormValues = {
      name: String(fd.get('name') ?? ''),
      timezone: String(fd.get('timezone') ?? 'Asia/Jakarta'),
      taxRatePct: Number(fd.get('taxRatePct') ?? 11),
      taxEnabled: fd.get('taxEnabled') === 'on',
    };
    if (phone) values.phone = phone;
    if (addressLine) values.addressLine = addressLine;
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Nama kafe</FieldLabel>
          <Input id="name" name="name" required defaultValue={initial.name} maxLength={80} />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Nomor HP</FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial.phone ?? ''}
            placeholder="08xx-xxxx-xxxx"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="addressLine">Alamat (opsional)</FieldLabel>
          <Input id="addressLine" name="addressLine" defaultValue={initial.addressLine ?? ''} />
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Zona waktu</FieldLabel>
          <Input id="timezone" name="timezone" defaultValue={initial.timezone} />
        </Field>
        <Field>
          <FieldLabel htmlFor="taxRatePct">Persentase PPN</FieldLabel>
          <Input
            id="taxRatePct"
            name="taxRatePct"
            type="number"
            min="0"
            max="100"
            step="0.5"
            defaultValue={initial.taxRatePct}
          />
        </Field>
        <Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="taxEnabled"
              defaultChecked={initial.taxEnabled}
              className="h-4 w-4"
            />
            Aktifkan PPN di kasir
          </label>
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2 items-center">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : submitLabel}
          </Button>
          {secondaryAction && (
            <Button type="button" variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
