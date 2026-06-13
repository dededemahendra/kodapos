import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type PromoType = 'percent' | 'fixed';
type PromoScope = 'order' | 'item' | 'category';

/** A popover whose content is a scrollable checkbox list of targets. The trigger
 *  shows the selected count. Generic over the option id type. */
function TargetPicker<T extends string>({
  options,
  selected,
  onToggle,
  placeholder,
  countLabel,
}: {
  options: ReadonlyArray<{ id: T; name: string }>;
  selected: T[];
  onToggle: (id: T) => void;
  placeholder: string;
  countLabel: (n: number) => string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="justify-start font-normal">
          {selected.length > 0 ? countLabel(selected.length) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <div className="max-h-64 overflow-y-auto p-1">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
              />
              <span className="truncate">{opt.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PromoFormDialog({
  open,
  promo,
  onOpenChange,
}: {
  open: boolean;
  promo: Doc<'promotions'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = promo !== null;
  const create = useMutation(api.promotions.create);
  const update = useMutation(api.promotions.update);
  const items = useQuery(api.menu.items.list, {});
  const categories = useQuery(api.menu.categories.list, {});
  const [name, setName] = useState('');
  const [type, setType] = useState<PromoType>('percent');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [scope, setScope] = useState<PromoScope>('order');
  const [targetItemIds, setTargetItemIds] = useState<Id<'menuItems'>[]>([]);
  const [targetCategoryIds, setTargetCategoryIds] = useState<Id<'categories'>[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(promo?.name ?? '');
      setType(promo?.type ?? 'percent');
      setValue(promo ? String(promo.value) : '');
      setCode(promo?.code ?? '');
      setScope(promo?.scope ?? 'order');
      setTargetItemIds(promo?.targetItemIds ?? []);
      setTargetCategoryIds(promo?.targetCategoryIds ?? []);
      setError(null);
    }
  }, [open, promo]);

  // Switching scope clears the now-irrelevant target selections.
  function onScopeChange(next: PromoScope) {
    setScope(next);
    setTargetItemIds([]);
    setTargetCategoryIds([]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (scope === 'item' && targetItemIds.length === 0) {
      setError(t`Pilih minimal satu target.`);
      return;
    }
    if (scope === 'category' && targetCategoryIds.length === 0) {
      setError(t`Pilih minimal satu target.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    // Number (not parseInt) so "10.5" reaches server validation as 10.5 and is
    // rejected, rather than being silently truncated to 10.
    const parsedValue = Number(value);
    const trimmedCode = code.trim();
    const codeArg = trimmedCode ? { code: trimmedCode } : {};
    const targetArg =
      scope === 'item'
        ? { targetItemIds }
        : scope === 'category'
          ? { targetCategoryIds }
          : {};
    try {
      if (isEdit && promo) {
        await update({
          id: promo._id,
          name,
          type,
          value: parsedValue,
          scope,
          ...codeArg,
          ...targetArg,
        });
        toast.success(t`Promo diperbarui.`);
      } else {
        await create({ name, type, value: parsedValue, scope, ...codeArg, ...targetArg });
        toast.success(t`Promo ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan promo.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? <Trans>Ubah promo</Trans> : <Trans>Tambah promo</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="promo-name"><Trans>Nama promo</Trans></FieldLabel>
              <Input
                id="promo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-code"><Trans>Kode promo</Trans></FieldLabel>
              <Input
                id="promo-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={20}
              />
              <FieldDescription><Trans>Opsional</Trans></FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-type"><Trans>Tipe</Trans></FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as PromoType)}>
                <SelectTrigger id="promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t`Persen`}</SelectItem>
                  <SelectItem value="fixed">{t`Nominal`}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-value">
                {type === 'percent' ? <Trans>Nilai (%)</Trans> : <Trans>Nilai (Rp)</Trans>}
              </FieldLabel>
              <Input
                id="promo-value"
                type="number"
                min="1"
                {...(type === 'percent' ? { max: '100' } : {})}
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-scope"><Trans>Cakupan</Trans></FieldLabel>
              <Select value={scope} onValueChange={(v) => onScopeChange(v as PromoScope)}>
                <SelectTrigger id="promo-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">{t`Seluruh order`}</SelectItem>
                  <SelectItem value="item">{t`Item tertentu`}</SelectItem>
                  <SelectItem value="category">{t`Kategori tertentu`}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {scope === 'item' && (
              <Field>
                <FieldLabel><Trans>Item target</Trans></FieldLabel>
                <TargetPicker
                  options={(items ?? []).map((i) => ({ id: i._id, name: i.name }))}
                  selected={targetItemIds}
                  onToggle={(id) =>
                    setTargetItemIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                  placeholder={t`Pilih item`}
                  countLabel={(n) => t`${n} item dipilih`}
                />
              </Field>
            )}
            {scope === 'category' && (
              <Field>
                <FieldLabel><Trans>Kategori target</Trans></FieldLabel>
                <TargetPicker
                  options={(categories ?? []).map((c) => ({ id: c._id, name: c.name }))}
                  selected={targetCategoryIds}
                  onToggle={(id) =>
                    setTargetCategoryIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                  placeholder={t`Pilih kategori`}
                  countLabel={(n) => t`${n} kategori dipilih`}
                />
              </Field>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
