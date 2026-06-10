import { afterEach, describe, expect, it, vi } from 'vitest';
import { XenditProvider } from '../../convex/payments/providers/xendit';
import { resolveProvider } from '../../convex/payments/providers';
import { MockProvider } from '../../convex/payments/providers/mock';

afterEach(() => vi.restoreAllMocks());
const CFG = { secretApiKey: 'xnd_test_key', callbackToken: 'cbtoken123' };

describe('XenditProvider', () => {
  it('createCharge posts to /qr_codes and maps the response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_abc', qr_string: '00020101...', expires_at: '2026-06-10T12:00:00Z' }), { status: 201 })
    );
    const p = new XenditProvider(CFG);
    const r = await p.createCharge({ amountIDR: 36000, referenceId: 'ord-1' });
    expect(r.providerRef).toBe('qr_abc');
    expect(r.qrString).toBe('00020101...');
    expect(r.expiresAt).toBe(Date.parse('2026-06-10T12:00:00Z'));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('/qr_codes');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toContain('Basic ');
  });

  it('createCharge throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"nope"}', { status: 400 }));
    await expect(new XenditProvider(CFG).createCharge({ amountIDR: 1000, referenceId: 'x' })).rejects.toThrow(/QRIS/i);
  });

  it('createCharge falls back to a finite future expiresAt when expires_at is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_x', qr_string: 's' }), { status: 201 })
    );
    const r = await new XenditProvider(CFG).createCharge({ amountIDR: 1000, referenceId: 'ord-2' });
    expect(r.providerRef).toBe('qr_x');
    expect(r.qrString).toBe('s');
    expect(Number.isFinite(r.expiresAt)).toBe(true);
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('parseReference extracts data.qr_id', () => {
    const body = JSON.stringify({ event: 'qr.payment', data: { qr_id: 'qr_abc', reference_id: 'ord-1', status: 'SUCCEEDED' } });
    expect(XenditProvider.parseReference(body)).toBe('qr_abc');
    expect(XenditProvider.parseReference('not json')).toBeNull();
  });

  it('verifyWebhook checks x-callback-token and maps status', async () => {
    const p = new XenditProvider(CFG);
    const body = JSON.stringify({ data: { qr_id: 'qr_abc', status: 'SUCCEEDED' } });
    const ok = new Headers({ 'x-callback-token': 'cbtoken123' });
    const bad = new Headers({ 'x-callback-token': 'wrong' });
    await expect(p.verifyWebhook({ body, headers: ok })).resolves.toEqual({ providerRef: 'qr_abc', status: 'paid' });
    await expect(p.verifyWebhook({ body, headers: bad })).resolves.toBeNull();
    await expect(p.verifyWebhook({ body, headers: new Headers() })).resolves.toBeNull();
  });
});

describe('resolveProvider', () => {
  it('returns XenditProvider for a complete xendit config, else MockProvider', () => {
    expect(resolveProvider({ provider: 'xendit', secretApiKey: 'k', callbackToken: 't' })).toBeInstanceOf(XenditProvider);
    expect(resolveProvider({ provider: 'xendit', secretApiKey: 'k' })).toBeInstanceOf(MockProvider);
    expect(resolveProvider(undefined)).toBeInstanceOf(MockProvider);
  });
});

describe('XenditProvider.fetchStatus', () => {
  const CFG2 = { secretApiKey: 'xnd_test_key', callbackToken: 'cb' };

  it('maps a succeeded payment to paid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'qr_1', status: 'ACTIVE', payments: [{ status: 'SUCCEEDED' }] }), { status: 200 })
    );
    await expect(new XenditProvider(CFG2).fetchStatus('qr_1')).resolves.toBe('paid');
  });

  it('maps an active unpaid QR to pending and inactive to expired', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'qr_2', status: 'ACTIVE', payments: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'qr_3', status: 'INACTIVE', payments: [] }), { status: 200 }));
    await expect(new XenditProvider(CFG2).fetchStatus('qr_2')).resolves.toBe('pending');
    await expect(new XenditProvider(CFG2).fetchStatus('qr_3')).resolves.toBe('expired');
  });

  it('returns unknown on a non-2xx without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    await expect(new XenditProvider(CFG2).fetchStatus('qr_x')).resolves.toBe('unknown');
  });
});
