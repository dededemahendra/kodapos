import { useLingui } from '@lingui/react/macro';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface OtpInputProps {
  /** Number of code cells. Defaults to 8 (the OTP / reset code length). */
  digits?: number;
  /** Called when the user fills all digits. Caller decides what to do with the value. */
  onComplete: (code: string) => void;
  /** Optional caller-controlled error message shown below the cells. */
  errorMessage?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A multi-cell numeric code input. Mirrors the staff PinEntry mechanics, with
 * paste support so a code copied from the email can fill every cell at once.
 * Used by signin (passwordless code) and password-reset.
 */
export function OtpInput({
  digits = 8,
  onComplete,
  errorMessage,
  disabled,
}: OtpInputProps) {
  const { t } = useLingui();
  const [values, setValues] = useState<string[]>(() => Array(digits).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function fill(next: string[]): void {
    setValues(next);
    if (next.every((c) => c.length === 1)) onComplete(next.join(''));
  }

  function handleChange(idx: number, char: string): void {
    const digit = char.replace(/\D/g, '').slice(0, 1);
    const next = [...values];
    next[idx] = digit;
    if (digit && idx < digits - 1) refs.current[idx + 1]?.focus();
    fill(next);
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>): void {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, digits);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(digits).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    const focusIdx = Math.min(pasted.length, digits - 1);
    refs.current[focusIdx]?.focus();
    fill(next);
  }

  function reset(): void {
    setValues(Array(digits).fill(''));
    refs.current[0]?.focus();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is stable
  useEffect(() => {
    if (errorMessage) reset();
  }, [errorMessage]);

  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/useSemanticElements: <fieldset> would constrain layout; group role with aria-label is sufficient */}
      <div className="flex justify-center gap-1.5 sm:gap-2" role="group" aria-label={t`Kode`}>
        {values.map((v, idx) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length array of digit cells
            key={idx}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="\d"
            maxLength={1}
            disabled={disabled}
            value={v}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            className="size-11 rounded-md border border-border bg-background text-center text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:size-12"
            aria-label={t`Digit ${idx + 1}`}
          />
        ))}
      </div>
      {errorMessage && (
        <p className="text-center text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
