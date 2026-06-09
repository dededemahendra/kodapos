import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export type PaymentMethod = 'cash' | 'qris_static' | 'qris_dynamic';

type SettingsShape = {
  payment: { methods: { cash: boolean; qrisStatic: boolean } };
  qrisImageUrl?: string;
  integrations: Array<{ key: string; connected: boolean }>;
};

export type PaymentMethodEntry = {
  method: PaymentMethod;
  label: ReactNode;
  isReady: (s: SettingsShape) => boolean;
};

export const PAYMENT_METHODS: PaymentMethodEntry[] = [
  { method: 'cash', label: <Trans>Tunai</Trans>, isReady: (s) => s.payment.methods.cash },
  {
    method: 'qris_static',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.payment.methods.qrisStatic && Boolean(s.qrisImageUrl),
  },
  {
    method: 'qris_dynamic',
    label: <Trans>QRIS</Trans>,
    isReady: (s) => s.integrations.some((i) => i.key === 'qris' && i.connected),
  },
];

export function methodLabel(method: PaymentMethod): ReactNode {
  return PAYMENT_METHODS.find((m) => m.method === method)?.label ?? method;
}
