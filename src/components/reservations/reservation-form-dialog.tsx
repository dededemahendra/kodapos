import { Trans, useLingui } from '@lingui/react/macro';
import { CalendarDays } from 'lucide-react';
import { api } from 'convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
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

/** A row from `api.reservations.list`. */
export type ReservationRow = FunctionReturnType<typeof api.reservations.list>['rows'][number];

const NO_CUSTOMER = '__none__';
const NO_TABLE = '__none__';

// Format a Date as the local 'YYYY-MM-DD' label shown in the popover trigger.
function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Derive the local 'HH:MM' clock string from an absolute ms timestamp.
function timeFromMs(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function ReservationFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ReservationRow | null;
}) {
  const { t } = useLingui();
  const isEdit = editing != null;
  const create = useMutation(api.reservations.create);
  const update = useMutation(api.reservations.update);
  const customers = useQuery(api.customers.list, {});
  const tables = useQuery(api.tables.list, {});

  const [customerValue, setCustomerValue] = useState<string>(NO_CUSTOMER);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [tableValue, setTableValue] = useState<string>(NO_TABLE);
  const [durationMin, setDurationMin] = useState('90');
  const [note, setNote] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const at = new Date(editing.at);
      setCustomerValue(NO_CUSTOMER);
      setCustomerName(editing.customerName);
      setPhone(editing.phone ?? '');
      setDate(new Date(at.getFullYear(), at.getMonth(), at.getDate()));
      setTime(timeFromMs(editing.at));
      setPartySize(String(editing.partySize));
      setTableValue(editing.tableId ?? NO_TABLE);
      setDurationMin(String(editing.durationMin));
      setNote(editing.note ?? '');
    } else {
      setCustomerValue(NO_CUSTOMER);
      setCustomerName('');
      setPhone('');
      setDate(new Date());
      setTime('');
      setPartySize('2');
      setTableValue(NO_TABLE);
      setDurationMin('90');
      setNote('');
    }
    setError(null);
  }, [open, editing]);

  // Selecting a customer prefills name + phone but keeps both editable.
  function onCustomerChange(value: string) {
    setCustomerValue(value);
    if (value === NO_CUSTOMER) return;
    const picked = (customers ?? []).find((c) => c._id === value);
    if (picked) {
      setCustomerName(picked.name);
      setPhone(picked.phone);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setError(t`Nama tamu wajib diisi.`);
      return;
    }
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      setError(t`Jumlah tamu minimal 1.`);
      return;
    }
    if (!date || !time) {
      setError(t`Tanggal dan waktu wajib diisi.`);
      return;
    }

    // Build the absolute timestamp from the picked calendar day + 'HH:MM',
    // constructed in the browser's local time. We assume the staff device runs
    // in the café's timezone; the server only stores the resulting ms.
    const d = new Date(date);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    const at = d.getTime();

    const duration = Number(durationMin);
    const customerId =
      customerValue === NO_CUSTOMER ? undefined : (customerValue as Id<'customers'>);
    const tableId = tableValue === NO_TABLE ? undefined : (tableValue as Id<'tables'>);

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await update({
          id: editing.id,
          customerName: trimmedName,
          phone,
          partySize: size,
          at,
          durationMin: Number.isFinite(duration) ? duration : 90,
          note,
          ...(customerId ? { customerId } : {}),
          ...(tableId ? { tableId } : {}),
        });
        toast.success(t`Reservasi diperbarui.`);
      } else {
        await create({
          customerName: trimmedName,
          partySize: size,
          at,
          ...(phone.trim() ? { phone } : {}),
          ...(Number.isFinite(duration) ? { durationMin: duration } : {}),
          ...(note.trim() ? { note } : {}),
          ...(customerId ? { customerId } : {}),
          ...(tableId ? { tableId } : {}),
        });
        toast.success(t`Reservasi dibuat.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan reservasi.`;
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
            {isEdit ? <Trans>Ubah reservasi</Trans> : <Trans>Buat reservasi</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reservation-customer">
                <Trans>Pelanggan</Trans>
              </FieldLabel>
              <Select value={customerValue} onValueChange={onCustomerChange}>
                <SelectTrigger id="reservation-customer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>{t`Tanpa pelanggan`}</SelectItem>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-name">
                <Trans>Nama tamu</Trans>
              </FieldLabel>
              <Input
                id="reservation-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                maxLength={60}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-phone">
                <Trans>Telepon</Trans>
              </FieldLabel>
              <Input
                id="reservation-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-date">
                <Trans>Tanggal</Trans>
              </FieldLabel>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="reservation-date"
                    type="button"
                    variant="outline"
                    className="justify-start font-normal"
                  >
                    <CalendarDays />
                    {date ? formatDateLabel(date) : <Trans>Pilih tanggal</Trans>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    {...(date ? { defaultMonth: date } : {})}
                    selected={date}
                    onSelect={(next) => {
                      if (next) {
                        setDate(next);
                        setCalendarOpen(false);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-time">
                <Trans>Waktu</Trans>
              </FieldLabel>
              <Input
                id="reservation-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-party">
                <Trans>Jumlah tamu</Trans>
              </FieldLabel>
              <Input
                id="reservation-party"
                type="number"
                min={1}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-table">
                <Trans>Meja</Trans>
              </FieldLabel>
              <Select value={tableValue} onValueChange={setTableValue}>
                <SelectTrigger id="reservation-table">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TABLE}>{t`Tanpa meja`}</SelectItem>
                  {(tables ?? []).map((tbl) => (
                    <SelectItem key={tbl._id} value={tbl._id}>
                      {tbl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-duration">
                <Trans>Durasi (menit)</Trans>
              </FieldLabel>
              <Input
                id="reservation-duration"
                type="number"
                min={1}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reservation-note">
                <Trans>Catatan</Trans>
              </FieldLabel>
              <Input
                id="reservation-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
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
