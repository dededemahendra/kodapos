import { Trans } from '@lingui/react/macro';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { ReportPreset, ReportSearch } from './use-report-range';

const PRESET_LABELS: Array<{ value: ReportPreset; label: React.ReactNode }> = [
  { value: 'today', label: <Trans>Hari ini</Trans> },
  { value: 'yesterday', label: <Trans>Kemarin</Trans> },
  { value: 'last7', label: <Trans>7 hari</Trans> },
  { value: 'last30', label: <Trans>30 hari</Trans> },
];

// Local calendar date <-> 'YYYY-MM-DD' key (no timezone conversion).
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function keyToDate(key: string): Date {
  const parts = key.split('-').map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function RangePicker({
  search,
  setPreset,
  setCustom,
}: {
  search: ReportSearch;
  setPreset: (preset: ReportPreset) => void;
  setCustom: (from: string, to: string) => void;
}) {
  const activePreset = 'preset' in search ? search.preset : null;
  const [open, setOpen] = useState(false);

  const selected: DateRange | undefined =
    'from' in search ? { from: keyToDate(search.from), to: keyToDate(search.to) } : undefined;
  const customLabel = 'from' in search ? `${search.from} → ${search.to}` : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_LABELS.map((p) => (
        <Button
          key={p.value}
          type="button"
          size="sm"
          variant={activePreset === p.value ? 'default' : 'outline'}
          onClick={() => setPreset(p.value)}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant={activePreset === null ? 'default' : 'outline'}>
            <CalendarDays />
            {customLabel ?? <Trans>Pilih tanggal</Trans>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            {...(selected?.from ? { defaultMonth: selected.from } : {})}
            selected={selected}
            onSelect={(next) => {
              if (next?.from && next?.to) {
                setCustom(toKey(next.from), toKey(next.to));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
