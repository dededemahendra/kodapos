import { ArrowUp } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Button } from '~/components/ui/button';

/**
 * A Claude-style chat composer: a rounded, shadowed card with an auto-resizing
 * textarea and a send button. Enter sends, Shift+Enter inserts a newline.
 * Controlled (value/onChange) so the page owns the input state.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder,
  autoFocus = false,
  sendLabel = 'Send',
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Localized accessible label for the send button. */
  sendLabel?: string;
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
        onClick={onSend}
        disabled={disabled || !hasText}
        aria-label={sendLabel}
        className="absolute bottom-2.5 right-2.5 size-9 rounded-xl"
      >
        <ArrowUp className="size-4" />
      </Button>
    </div>
  );
}
