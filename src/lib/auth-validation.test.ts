import { describe, expect, it } from 'vitest';
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
    expect(validateEmail('')).toBe('Email wajib diisi.');
    expect(validateEmail('   ')).toBe('Email wajib diisi.');
  });
  it('rejects malformed', () => {
    expect(validateEmail('abc')).toBe('Format email tidak valid.');
    expect(validateEmail('a@b')).toBe('Format email tidak valid.');
    expect(validateEmail('@example.com')).toBe('Format email tidak valid.');
  });
  it('accepts a valid address', () => {
    expect(validateEmail('warren@example.com')).toBeNull();
    expect(validateEmail('  warren+tag@kodapos.test  ')).toBeNull();
  });
});

describe('validatePasswordRequired', () => {
  it('rejects empty', () => {
    expect(validatePasswordRequired('')).toBe('Password wajib diisi.');
  });
  it('accepts anything non-empty', () => {
    expect(validatePasswordRequired('x')).toBeNull();
  });
});

describe('validatePasswordSignup', () => {
  it('rejects empty', () => {
    expect(validatePasswordSignup('')).toBe('Password wajib diisi.');
  });
  it('rejects <8 chars', () => {
    expect(validatePasswordSignup('abc')).toBe('Password minimal 8 karakter.');
    expect(validatePasswordSignup('abcdefg')).toBe('Password minimal 8 karakter.');
  });
  it('accepts 8+', () => {
    expect(validatePasswordSignup('abcdefgh')).toBeNull();
  });
});

describe('validateName', () => {
  it('rejects empty', () => {
    expect(validateName('')).toBe('Nama wajib diisi.');
    expect(validateName('   ')).toBe('Nama wajib diisi.');
  });
  it('accepts non-empty', () => {
    expect(validateName('Warren')).toBeNull();
  });
});

describe('validateCafeName', () => {
  it('rejects empty', () => {
    expect(validateCafeName('')).toBe('Nama kafe wajib diisi.');
  });
  it('rejects > 80 chars', () => {
    expect(validateCafeName('x'.repeat(81))).toBe('Nama kafe maksimal 80 karakter.');
  });
  it('accepts valid name', () => {
    expect(validateCafeName('Kopi Senja')).toBeNull();
  });
});

describe('passwordStrength', () => {
  it('empty returns bucket 0 / 0%', () => {
    expect(passwordStrength('')).toEqual({ bucket: 0, label: '', percent: 0 });
  });
  it('short returns Lemah / 33%', () => {
    expect(passwordStrength('abc')).toEqual({ bucket: 1, label: 'Lemah', percent: 33 });
  });
  it('8+ chars OR 2-class returns Sedang / 66%', () => {
    expect(passwordStrength('warren12')).toEqual({ bucket: 2, label: 'Sedang', percent: 66 });
    // 6 chars with 2 classes (lower+digit) — qualifies via the OR branch
    expect(passwordStrength('warr3n')).toEqual({ bucket: 2, label: 'Sedang', percent: 66 });
  });
  it('12+ chars AND 3-class returns Kuat / 100%', () => {
    expect(passwordStrength('Warren!2026Kopi')).toEqual({
      bucket: 3,
      label: 'Kuat',
      percent: 100,
    });
  });
});
