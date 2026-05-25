const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Email wajib diisi.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Format email tidak valid.';
  return null;
}

export function validatePasswordRequired(value: string): string | null {
  if (value.length === 0) return 'Password wajib diisi.';
  return null;
}

export function validatePasswordSignup(value: string): string | null {
  if (value.length === 0) return 'Password wajib diisi.';
  if (value.length < 8) return 'Password minimal 8 karakter.';
  return null;
}

export function validateName(value: string): string | null {
  if (value.trim().length === 0) return 'Nama wajib diisi.';
  return null;
}

export function validateCafeName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Nama kafe wajib diisi.';
  if (trimmed.length > 80) return 'Nama kafe maksimal 80 karakter.';
  return null;
}

export type PasswordStrength = {
  bucket: 0 | 1 | 2 | 3;
  label: '' | 'Lemah' | 'Sedang' | 'Kuat';
  percent: 0 | 33 | 66 | 100;
};

export function passwordStrength(value: string): PasswordStrength {
  if (value.length === 0) return { bucket: 0, label: '', percent: 0 };
  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;
  if (value.length >= 12 && classes >= 3) {
    return { bucket: 3, label: 'Kuat', percent: 100 };
  }
  if (value.length >= 8 || classes >= 2) {
    return { bucket: 2, label: 'Sedang', percent: 66 };
  }
  return { bucket: 1, label: 'Lemah', percent: 33 };
}
