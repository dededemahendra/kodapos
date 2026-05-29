import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): MessageDescriptor | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return msg`Email wajib diisi.`;
  if (!EMAIL_REGEX.test(trimmed)) return msg`Format email tidak valid.`;
  return null;
}

export function validatePasswordRequired(value: string): MessageDescriptor | null {
  if (value.length === 0) return msg`Password wajib diisi.`;
  return null;
}

export function validatePasswordSignup(value: string): MessageDescriptor | null {
  if (value.length === 0) return msg`Password wajib diisi.`;
  if (value.length < 8) return msg`Password minimal 8 karakter.`;
  return null;
}

export function validateName(value: string): MessageDescriptor | null {
  if (value.trim().length === 0) return msg`Nama wajib diisi.`;
  return null;
}

export function validateCafeName(value: string): MessageDescriptor | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return msg`Nama kafe wajib diisi.`;
  if (trimmed.length > 80) return msg`Nama kafe maksimal 80 karakter.`;
  return null;
}

export type PasswordStrength = {
  bucket: 0 | 1 | 2 | 3;
  label: MessageDescriptor | null;
  percent: 0 | 33 | 66 | 100;
};

export function passwordStrength(value: string): PasswordStrength {
  if (value.length === 0) return { bucket: 0, label: null, percent: 0 };
  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;
  if (value.length >= 12 && classes >= 3) {
    return { bucket: 3, label: msg`Kuat`, percent: 100 };
  }
  if (value.length >= 8 || classes >= 2) {
    return { bucket: 2, label: msg`Sedang`, percent: 66 };
  }
  return { bucket: 1, label: msg`Lemah`, percent: 33 };
}
