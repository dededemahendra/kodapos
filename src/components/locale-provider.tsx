'use client';

import { i18n } from '~/lib/i18n';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { getStoredLocale, type Locale, storeLocale } from '~/lib/locale';

type LocaleContextValue = { locale: Locale; setLocale: (l: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

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
