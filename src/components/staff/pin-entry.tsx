import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

export interface PinEntryProps {
  digits?: number;
  /** Called when the user fills all digits. Caller decides what to do with the value. */
  onComplete: (pin: string) => void;
  /** Optional caller-controlled error message shown below the cells. */
  errorMessage?: string;
}

export function PinEntry({ digits = 4, onComplete, errorMessage }: PinEntryProps) {
  const [values, setValues] = useState<string[]>(() => Array(digits).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function handleChange(idx: number, char: string): void {
    const digit = char.replace(/\D/g, '').slice(0, 1);
    const next = [...values];
    next[idx] = digit;
    setValues(next);
    if (digit && idx < digits - 1) refs.current[idx + 1]?.focus();
    if (next.every((c) => c.length === 1)) onComplete(next.join(''));
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace' && !values[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
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
      <div className="flex gap-2 justify-center" role="group" aria-label="PIN">
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
            value={v}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className="size-14 text-center text-2xl font-semibold rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Digit ${idx + 1}`}
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
