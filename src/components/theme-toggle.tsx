'use client';

import { useLingui } from '@lingui/react/macro';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { applyTheme, storeTheme } from '~/lib/preferences';

/**
 * Light/dark toggle button. Reads the effective theme from the `.dark` class
 * (already applied pre-paint by the root theme script) after mount so it stays
 * SSR-safe, and flips to an explicit 'light'/'dark' preference on click. Before
 * mount it renders the moon icon on both server and client, so there is no
 * hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useLingui();
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = isDark ? 'light' : 'dark';
    storeTheme(next);
    applyTheme(next);
    setIsDark(!isDark);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={isDark ? t`Ganti ke mode terang` : t`Ganti ke mode gelap`}
    >
      {mounted && isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
