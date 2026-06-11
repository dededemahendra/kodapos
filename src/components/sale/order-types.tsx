import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export type OrderType = 'dine_in' | 'takeaway' | 'pickup';

export const ORDER_TYPE_OPTIONS: { value: OrderType; label: ReactNode }[] = [
  { value: 'dine_in', label: <Trans>Makan di tempat</Trans> },
  { value: 'takeaway', label: <Trans>Bawa pulang</Trans> },
  { value: 'pickup', label: <Trans>Ambil di tempat</Trans> },
];
