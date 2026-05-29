'use client';

import { i18n } from '~/lib/i18n';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { DEFAULT_LOCALE, getStoredLocale, type Locale, storeLocale } from '~/lib/locale';

type LocaleContextValue = { locale: Locale; setLocale: (l: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always start with DEFAULT_LOCALE so server and client first render agree.
  // This eliminates the SSR/hydration mismatch.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // After mount, read the persisted locale and switch if it differs.
  // This runs only on the client, so it never affects the SSR or first render.
  useEffect(() => {
    const stored = getStoredLocale();
    if (stored !== DEFAULT_LOCALE) {
      i18n.activate(stored);
      setLocaleState(stored);
    }
  }, []);

  function setLocale(next: Locale) {
    i18n.activate(next); // <I18nProvider> re-renders <Trans>/useLingui consumers
    storeLocale(next);
    setLocaleState(next);
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
