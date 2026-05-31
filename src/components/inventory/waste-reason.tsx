import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

// Raw DB waste-reason value → translated label. Shared by the waste log and
// the movement-history sheet so both read in the UI locale.
export const WASTE_REASON_LABELS: Record<string, ReactNode> = {
  rusak: <Trans>Rusak</Trans>,
  basi: <Trans>Basi/Kedaluwarsa</Trans>,
  tumpah: <Trans>Tumpah</Trans>,
  salah_masak: <Trans>Salah masak</Trans>,
  lainnya: <Trans>Lainnya</Trans>,
};
