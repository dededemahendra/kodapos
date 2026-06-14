import type { Locale } from './locale';

/** A string available in both app locales. Used for content that lives as data
 * (changelog, help, docs) rather than in the Lingui message catalog. */
export type Localized = { id: string; en: string };

/** Picks the copy for the active locale (falls back to Indonesian). */
export function localized(value: Localized, locale: Locale): string {
  return value[locale] ?? value.id;
}
