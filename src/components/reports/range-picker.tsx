import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { type ReportPreset, useReportRange } from './use-report-range';

const PRESET_LABELS: Array<{ value: ReportPreset; label: React.ReactNode }> = [
  { value: 'today', label: <Trans>Hari ini</Trans> },
  { value: 'yesterday', label: <Trans>Kemarin</Trans> },
  { value: 'last7', label: <Trans>7 hari</Trans> },
  { value: 'last30', label: <Trans>30 hari</Trans> },
];

export function RangePicker() {
  const { search, setPreset, setCustom } = useReportRange();
  const activePreset = 'preset' in search ? search.preset : null;
  const [from, setFrom] = useState('from' in search ? search.from : '');
  const [to, setTo] = useState('to' in search ? search.to : '');

  function applyPreset(preset: ReportPreset) {
    setFrom('');
    setTo('');
    setPreset(preset);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_LABELS.map((p) => (
        <Button
          key={p.value}
          type="button"
          size="sm"
          variant={activePreset === p.value ? 'default' : 'outline'}
          onClick={() => applyPreset(p.value)}
        >
          {p.label}
        </Button>
      ))}
      <span className="flex items-center gap-1">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" />
        <span className="text-muted-foreground">–</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" />
        <Button
          type="button"
          size="sm"
          variant={activePreset === null ? 'default' : 'outline'}
          disabled={!from || !to}
          onClick={() => setCustom(from, to)}
        >
          <Trans>Terapkan</Trans>
        </Button>
      </span>
    </div>
  );
}
