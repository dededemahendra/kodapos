import { ArrowUp, Square } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Button } from '~/components/ui/button';

/**
 * A Claude-style chat composer: a rounded, shadowed card with an auto-resizing
 * textarea and a send button. Enter sends, Shift+Enter inserts a newline.
 * Controlled (value/onChange) so the page owns the input state.
 *
 * While `streaming`, the send button becomes a stop button: it stays
 * clickable even though the rest of the composer is disabled, since it is the
 * only way out of a long generation.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder,
  autoFocus = false,
  sendLabel = 'Send',
  streaming = false,
  onStop = () => {},
  stopLabel = 'Stop',
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Localized accessible label for the send button. */
  sendLabel?: string;
  /** Swaps the send button for a stop button while a reply is streaming in. */
  streaming?: boolean;
  onStop?: () => void;
  /** Localized accessible label for the stop button. */
  stopLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a max height, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  const hasText = value.trim().length > 0;

  return (
    <div className="relative rounded-2xl border bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring/40">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        // biome-ignore lint/a11y/noAutofocus: chat composer is the page's primary control
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="block max-h-52 min-h-[3.25rem] w-full resize-none bg-transparent py-4 pl-4 pr-14 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="button"
        size="icon"
        onClick={streaming ? onStop : onSend}
        // While streaming, stop must stay clickable even though the composer is
        // disabled — it is the only way out of a long generation.
        disabled={streaming ? false : disabled || !hasText}
        aria-label={streaming ? stopLabel : sendLabel}
        className="absolute bottom-2.5 right-2.5 size-9 rounded-xl"
      >
        {streaming ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  );
}
