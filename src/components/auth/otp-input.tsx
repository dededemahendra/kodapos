import { useLingui } from '@lingui/react/macro';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useEffect, useRef, useState } from 'react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '~/components/ui/input-otp';

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
 * A numeric code input built on the shadcn `InputOTP` primitive (paste-aware,
 * keyboard navigable, numeric-only). Used by signin (passwordless code) and
 * password-reset. Clears itself when the caller surfaces an error so the user
 * can retype from scratch.
 */
export function OtpInput({ digits = 8, onComplete, errorMessage, disabled }: OtpInputProps) {
  const { t } = useLingui();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the first cell on mount (via ref to avoid the autofocus lint).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear the entered code whenever the caller reports an error, then refocus.
  useEffect(() => {
    if (errorMessage) {
      setValue('');
      inputRef.current?.focus();
    }
  }, [errorMessage]);

  return (
    <div className="flex flex-col items-center gap-2">
      <InputOTP
        ref={inputRef}
        maxLength={digits}
        pattern={REGEXP_ONLY_DIGITS}
        value={value}
        onChange={setValue}
        onComplete={onComplete}
        disabled={disabled}
        aria-label={t`Kode`}
      >
        <InputOTPGroup>
          {Array.from({ length: digits }, (_, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length array of digit cells
            <InputOTPSlot key={idx} index={idx} className="size-11 text-lg sm:size-12" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {errorMessage && (
        <p className="text-center text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
