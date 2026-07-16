import { useLingui } from '@lingui/react/macro';
import { ScanLine } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Input } from '~/components/ui/input';

// Presentation-only scan input: a numeric field that submits a trimmed code,
// clears, and refocuses after each scan, with a green/red border flash driven
// by the `flash` prop. The caller owns resolution and the beep (scan-feedback).
export function ScanBar({
  onScan,
  flash,
  placeholder,
  autoFocus = true,
  className,
}: {
  onScan: (code: string) => void;
  flash?: 'hit' | 'miss' | null | undefined;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Stop the submit from bubbling to an outer <form> (e.g. the stock-take
    // dialog), which would otherwise fire that form's onSubmit on every scan.
    e.stopPropagation();
    const code = value.trim();
    if (code) onScan(code);
    setValue('');
    ref.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className={`flex items-center gap-2 ${className ?? ''}`}>
      <ScanLine className="size-4 shrink-0 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t`Scan / ketik barcode…`}
        inputMode="numeric"
        autoFocus={autoFocus}
        className={`h-9 transition-colors ${
          flash === 'hit'
            ? 'border-emerald-500 ring-1 ring-emerald-500'
            : flash === 'miss'
              ? 'border-destructive ring-1 ring-destructive'
              : ''
        }`}
      />
    </form>
  );
}
