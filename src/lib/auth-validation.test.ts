import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  i18n.activate('id');
});
import {
  passwordStrength,
  validateCafeName,
  validateEmail,
  validateName,
  validatePasswordRequired,
  validatePasswordSignup,
} from './auth-validation';

describe('validateEmail', () => {
  it('rejects empty', () => {
    expect(i18n._(validateEmail('')!)).toBe('Email wajib diisi.');
    expect(i18n._(validateEmail('   ')!)).toBe('Email wajib diisi.');
  });
  it('rejects malformed', () => {
    expect(i18n._(validateEmail('abc')!)).toBe('Format email tidak valid.');
    expect(i18n._(validateEmail('a@b')!)).toBe('Format email tidak valid.');
    expect(i18n._(validateEmail('@example.com')!)).toBe('Format email tidak valid.');
  });
  it('accepts a valid address', () => {
    expect(validateEmail('warren@example.com')).toBeNull();
    expect(validateEmail('  warren+tag@kodapos.test  ')).toBeNull();
  });
});

describe('validatePasswordRequired', () => {
  it('rejects empty', () => {
    expect(i18n._(validatePasswordRequired('')!)).toBe('Password wajib diisi.');
  });
  it('accepts anything non-empty', () => {
    expect(validatePasswordRequired('x')).toBeNull();
  });
});

describe('validatePasswordSignup', () => {
  it('rejects empty', () => {
    expect(i18n._(validatePasswordSignup('')!)).toBe('Password wajib diisi.');
  });
  it('rejects <8 chars', () => {
    expect(i18n._(validatePasswordSignup('abc')!)).toBe('Password minimal 8 karakter.');
    expect(i18n._(validatePasswordSignup('abcdefg')!)).toBe('Password minimal 8 karakter.');
  });
  it('accepts 8+', () => {
    expect(validatePasswordSignup('abcdefgh')).toBeNull();
  });
});

describe('validateName', () => {
  it('rejects empty', () => {
    expect(i18n._(validateName('')!)).toBe('Nama wajib diisi.');
    expect(i18n._(validateName('   ')!)).toBe('Nama wajib diisi.');
  });
  it('accepts non-empty', () => {
    expect(validateName('Warren')).toBeNull();
  });
});

describe('validateCafeName', () => {
  it('rejects empty', () => {
    expect(i18n._(validateCafeName('')!)).toBe('Nama kafe wajib diisi.');
  });
  it('rejects > 80 chars', () => {
    expect(i18n._(validateCafeName('x'.repeat(81))!)).toBe('Nama kafe maksimal 80 karakter.');
  });
  it('accepts valid name', () => {
    expect(validateCafeName('Kopi Senja')).toBeNull();
  });
});

describe('passwordStrength', () => {
  it('empty returns bucket 0 / 0% / null label', () => {
    const result = passwordStrength('');
    expect(result.bucket).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.label).toBeNull();
  });
  it('short returns Lemah / 33%', () => {
    const result = passwordStrength('abc');
    expect(result.bucket).toBe(1);
    expect(result.percent).toBe(33);
    expect(i18n._(result.label!)).toBe('Lemah');
  });
  it('8+ chars OR 2-class returns Sedang / 66%', () => {
    const r1 = passwordStrength('warren12');
    expect(r1.bucket).toBe(2);
    expect(r1.percent).toBe(66);
    expect(i18n._(r1.label!)).toBe('Sedang');
    // 6 chars with 2 classes (lower+digit) — qualifies via the OR branch
    const r2 = passwordStrength('warr3n');
    expect(r2.bucket).toBe(2);
    expect(r2.percent).toBe(66);
    expect(i18n._(r2.label!)).toBe('Sedang');
  });
  it('12+ chars AND 3-class returns Kuat / 100%', () => {
    const result = passwordStrength('Warren!2026Kopi');
    expect(result.bucket).toBe(3);
    expect(result.percent).toBe(100);
    expect(i18n._(result.label!)).toBe('Kuat');
  });
});
