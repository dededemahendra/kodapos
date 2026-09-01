import { describe, expect, it } from 'vitest';
import { offlineReceiptNumber } from '~/lib/offline/receipt-number';

describe('offlineReceiptNumber', () => {
  it('uses the last four characters of the clientId, uppercased', () => {
    expect(offlineReceiptNumber('K-', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12')).toBe('K-EF12');
  });

  it('works with no configured prefix', () => {
    expect(offlineReceiptNumber('', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeef12')).toBe('EF12');
  });
});
