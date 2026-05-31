import { describe, expect, it } from 'vitest';
import {
  STATUS_BADGE_VARIANTS,
  statusBadgeClasses,
} from './status-badge-variant';

describe('statusBadgeClasses', () => {
  it('returns a distinct class string for each variant', () => {
    const classes = STATUS_BADGE_VARIANTS.map((v) => statusBadgeClasses(v));
    // Every variant maps to a non-empty, unique class string.
    expect(new Set(classes).size).toBe(STATUS_BADGE_VARIANTS.length);
    for (const c of classes) expect(c.length).toBeGreaterThan(0);
  });

  it('uses primary tones for success and destructive tones for danger', () => {
    expect(statusBadgeClasses('success')).toContain('text-primary');
    expect(statusBadgeClasses('danger')).toContain('text-destructive');
    expect(statusBadgeClasses('muted')).toContain('text-muted-foreground');
  });
});
