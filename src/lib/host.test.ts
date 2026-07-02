import { describe, expect, it } from 'vitest';
import { resolveHostApp } from './host';

describe('resolveHostApp', () => {
  it("returns 'admin' for an admin.* host", () => {
    expect(resolveHostApp('admin.kodapos.app')).toBe('admin');
    expect(resolveHostApp('admin.localhost:5173')).toBe('admin');
    expect(resolveHostApp('ADMIN.kodapos.app')).toBe('admin');
  });

  it("returns 'tenant' for the tenant host and everything else", () => {
    expect(resolveHostApp('kodapos.app')).toBe('tenant');
    expect(resolveHostApp('www.kodapos.app')).toBe('tenant');
    expect(resolveHostApp('localhost:5173')).toBe('tenant');
    expect(resolveHostApp('')).toBe('tenant');
  });

  it("does not match a host that merely contains 'admin'", () => {
    expect(resolveHostApp('myadmin.kodapos.app')).toBe('tenant');
    expect(resolveHostApp('kodapos.app/admin')).toBe('tenant');
  });
});
