import { describe, expect, it } from 'vitest';
import { PESANAN } from '../../src/content/marketing/pesanan';
import { SHOTS } from '../../src/lib/shots';

const PAGES = [PESANAN];
const SHOT_IDS = new Set(SHOTS.map((s) => s.id));

function localizedStrings(node: unknown, out: { id: string; en: string }[] = []) {
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (typeof rec.id === 'string' && typeof rec.en === 'string') {
      out.push({ id: rec.id, en: rec.en });
      return out;
    }
    for (const v of Object.values(rec)) localizedStrings(v, out);
  }
  return out;
}

describe('marketing content', () => {
  for (const page of PAGES) {
    it(`${page.slug}: every localized string has non-empty id and en`, () => {
      const strings = localizedStrings(page);
      expect(strings.length).toBeGreaterThan(0);
      for (const s of strings) {
        expect(s.id.trim()).not.toBe('');
        expect(s.en.trim()).not.toBe('');
      }
    });

    it(`${page.slug}: english is actually translated, not copied from indonesian`, () => {
      // fallbackLocales.default = 'id' makes a forgotten translation render
      // Indonesian silently, so identical strings are the failure to catch.
      const suspicious = localizedStrings(page).filter(
        (s) => s.id === s.en && s.id.split(' ').length > 2
      );
      expect(suspicious).toEqual([]);
    });

    it(`${page.slug}: every referenced shot exists in the manifest`, () => {
      for (const section of page.sections) {
        if ('shot' in section && section.shot) expect(SHOT_IDS.has(section.shot)).toBe(true);
      }
    });

    it(`${page.slug}: every shot carries alt text`, () => {
      for (const section of page.sections) {
        if ('shot' in section && section.shot) {
          expect(section.shotAlt?.id.trim()).toBeTruthy();
          expect(section.shotAlt?.en.trim()).toBeTruthy();
        }
      }
    });

    it(`${page.slug}: states its limits`, () => {
      expect(page.sections.some((s) => s.kind === 'truth')).toBe(true);
    });
  }
});
