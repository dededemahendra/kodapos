import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

/** A shift row from `api.schedule.list`. */
export type ShiftRow = FunctionReturnType<typeof api.schedule.list>['rows'][number];

export function ShiftFormDialog({
  open,
  onOpenChange,
  editing,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ShiftRow | null;
  defaultDate?: string | undefined;
}) {
  const { t } = useLingui();
  const isEdit = editing != null;
  const create = useMutation(api.schedule.create);
  const update = useMutation(api.schedule.update);
  const staff = useQuery(api.staff.list, {});

  const [staffId, setStaffId] = useState<string>('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStaffId(editing.staffId);
      setDate(editing.date);
      setStartTime(editing.startTime);
      setEndTime(editing.endTime);
      setNote(editing.note ?? '');
    } else {
      setStaffId('');
      setDate(defaultDate ?? '');
      setStartTime('');
      setEndTime('');
      setNote('');
    }
    setError(null);
  }, [open, editing, defaultDate]);

  const activeStaff = (staff ?? []).filter((s) => !s.archived);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (!staffId) {
      setError(t`Pilih staf terlebih dahulu.`);
      return;
    }
    if (!date) {
      setError(t`Tanggal wajib diisi.`);
      return;
    }
    if (!startTime || !endTime) {
      setError(t`Waktu mulai dan selesai wajib diisi.`);
      return;
    }
    if (!(endTime > startTime)) {
      setError(t`Waktu selesai harus setelah mulai.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await update({
          id: editing.id,
          staffId: staffId as Id<'cafeStaff'>,
          date,
          startTime,
          endTime,
          note,
        });
        toast.success(t`Jadwal diperbarui.`);
      } else {
        await create({
          staffId: staffId as Id<'cafeStaff'>,
          date,
          startTime,
          endTime,
          ...(note.trim() ? { note } : {}),
        });
        toast.success(t`Jadwal dibuat.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan jadwal.`;
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
            {isEdit ? <Trans>Ubah jadwal</Trans> : <Trans>Tambah jadwal</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="shift-staff">
                <Trans>Staf</Trans>
              </FieldLabel>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger id="shift-staff">
                  <SelectValue placeholder={t`Pilih staf`} />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-date">
                <Trans>Tanggal</Trans>
              </FieldLabel>
              <Input
                id="shift-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-start">
                <Trans>Mulai</Trans>
              </FieldLabel>
              <Input
                id="shift-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-end">
                <Trans>Selesai</Trans>
              </FieldLabel>
              <Input
                id="shift-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-note">
                <Trans>Catatan</Trans>
              </FieldLabel>
              <Input
                id="shift-note"
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
