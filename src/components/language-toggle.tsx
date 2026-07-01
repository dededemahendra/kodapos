'use client';

import { useLocale } from '~/components/locale-provider';
import { cn } from '~/lib/utils';
import { LOCALES, type Locale } from '~/lib/locale';

/**
 * ID / EN segmented language switcher. Reused across the marketing chrome
 * (currently the footer); flips the active Lingui catalog via the locale
 * provider and persists the choice.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className={cn('flex items-center rounded-md border border-border p-0.5', className)}>
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLocale(l.value as Locale)}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium transition-colors',
            locale === l.value
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {l.value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
