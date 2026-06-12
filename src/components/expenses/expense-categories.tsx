import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export type ExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'supplies'
  | 'salary'
  | 'other';

export const EXPENSE_CATEGORY_OPTIONS: {
  value: ExpenseCategory;
  label: ReactNode;
}[] = [
  { value: 'rent', label: <Trans>Sewa</Trans> },
  { value: 'utilities', label: <Trans>Utilitas</Trans> },
  { value: 'supplies', label: <Trans>Perlengkapan</Trans> },
  { value: 'salary', label: <Trans>Gaji</Trans> },
  { value: 'other', label: <Trans>Lainnya</Trans> },
];
