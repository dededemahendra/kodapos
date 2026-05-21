import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface OptionRow {
  id?: Id<'modifierOptions'>;
  name: string;
  priceAdjustmentIDR: number;
  position: number;
}

export interface ModifierGroupFormProps {
  initialId?: Id<'modifierGroups'>;
  initialName: string;
  initialRequired: boolean;
  initialMinSelect: number;
  initialMaxSelect: number;
  initialOptions: OptionRow[];
  onSaved: (id: Id<'modifierGroups'>) => void;
}

export function ModifierGroupForm(props: ModifierGroupFormProps) {
  const upsert = useMutation(api.menu.modifierGroups.upsert);
  const [name, setName] = useState(props.initialName);
  const [required, setRequired] = useState(props.initialRequired);
  const [minSelect, setMinSelect] = useState(props.initialMinSelect);
  const [maxSelect, setMaxSelect] = useState(props.initialMaxSelect);
  const [options, setOptions] = useState<OptionRow[]>(props.initialOptions);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addRow() {
    const maxPos = options.length === 0 ? 0 : Math.max(...options.map((o) => o.position));
    setOptions([...options, { name: '', priceAdjustmentIDR: 0, position: maxPos + 100 }]);
  }

  function updateRow(idx: number, patch: Partial<OptionRow>) {
    setOptions((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number) {
    setOptions((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const id = await upsert({
        ...(props.initialId !== undefined && { id: props.initialId }),
        name,
        required,
        minSelect,
        maxSelect,
        options: options.map((o) => ({
          ...(o.id !== undefined && { id: o.id }),
          name: o.name,
          priceAdjustmentIDR: o.priceAdjustmentIDR,
          position: o.position,
        })),
      });
      props.onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan grup.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="groupName">Nama grup</FieldLabel>
          <Input
            id="groupName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel htmlFor="required">Wajib?</FieldLabel>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="required"
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4"
              />
              Cashier harus memilih
            </label>
          </Field>
          <Field>
            <FieldLabel htmlFor="minSelect">Min</FieldLabel>
            <Input
              id="minSelect"
              type="number"
              min="0"
              max="10"
              value={minSelect}
              onChange={(e) => setMinSelect(Number(e.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maxSelect">Max</FieldLabel>
            <Input
              id="maxSelect"
              type="number"
              min="1"
              max="10"
              value={maxSelect}
              onChange={(e) => setMaxSelect(Number(e.target.value))}
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-fg-muted">
              Opsi ({options.length})
            </span>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              + Opsi
            </Button>
          </div>
          <div className="space-y-2">
            {options.length === 0 && (
              <p className="text-sm text-fg-muted">Belum ada opsi. Tambahkan minimal satu.</p>
            )}
            {options.map((o, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: new rows have no persisted id yet; index is the pragmatic key.
              <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input
                  placeholder="Nama opsi (mis. Large)"
                  value={o.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  required
                  maxLength={60}
                />
                <Input
                  type="number"
                  min="0"
                  step="500"
                  placeholder="Selisih harga"
                  value={o.priceAdjustmentIDR}
                  onChange={(e) => updateRow(idx, { priceAdjustmentIDR: Number(e.target.value) })}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(idx)}>
                  Hapus
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <FieldError>{error}</FieldError>}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : 'Simpan grup'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
