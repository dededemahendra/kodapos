// tests/lib/shots.test.ts
import { describe, expect, it } from 'vitest';
import { SHOT_MANIFEST } from '../../scripts/lib/shots-manifest.mjs';
import { SHOTS, shotSrc } from '../../src/lib/shots';

describe('shot manifest', () => {
  it('has unique ids', () => {
    const ids = SHOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every shot an app-absolute path and a wait selector', () => {
    for (const s of SHOTS) {
      expect(s.path.startsWith('/')).toBe(true);
      expect(s.waitFor.length).toBeGreaterThan(0);
    }
  });

  it('covers every screen the pesanan page needs', () => {
    const ids = SHOTS.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(['tables', 'self-orders', 'kitchen', 'reservations', 'order-public'])
    );
  });

  it('builds a public URL per theme', () => {
    expect(shotSrc('kitchen', 'light')).toBe('/shots/kitchen-light.webp');
    expect(shotSrc('kitchen', 'dark')).toBe('/shots/kitchen-dark.webp');
  });

  it('keeps the app manifest and the capture-script manifest from drifting apart', () => {
    // scripts/capture-shots.mjs (Node) reads scripts/lib/shots-manifest.mjs at
    // runtime; src/lib/shots.ts (TypeScript) is what the marketing pages
    // import. They are two files by deliberate choice (a Node script cannot
    // safely regex-parse a TypeScript object literal), so nothing at the type
    // level stops them from drifting. This test is the safety net: it fails
    // if a shot is ever added to, removed from, or edited in one file but not
    // the other.
    const appIds = SHOTS.map((s) => s.id).sort();
    const scriptIds = SHOT_MANIFEST.map((s) => s.id).sort();
    expect(scriptIds).toEqual(appIds);

    const appById = new Map<string, (typeof SHOTS)[number]>(SHOTS.map((s) => [s.id, s]));
    for (const scriptShot of SHOT_MANIFEST) {
      const appShot = appById.get(scriptShot.id);
      expect(appShot, `src/lib/shots.ts is missing shot "${scriptShot.id}"`).toBeDefined();
      expect(scriptShot.path).toBe(appShot?.path);
      expect(scriptShot.waitFor).toBe(appShot?.waitFor);
    }
  });
});
