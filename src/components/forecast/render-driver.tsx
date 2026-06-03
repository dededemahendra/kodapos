import { Trans } from '@lingui/react/macro';

// Structured driver shapes mirror convex/lib/forecast.ts (client copy — the
// query returns plain objects; we render them localized here).
export type ForecastDriver =
  | { code: 'dow_busy' | 'dow_quiet'; pct: number; dow: number }
  | { code: 'holiday'; pct: number; key: string }
  | { code: 'weather'; pct: number; condition: 'hot' | 'rainy' | 'cool' | 'normal' };

// 0=Mon..6=Sun
const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function HolidayText({ pct, hkey }: { pct: number; hkey: string }) {
  const label = hkey.startsWith('lebaran')
    ? 'Lebaran'
    : hkey === 'independence'
      ? 'HUT RI'
      : hkey === 'christmas'
        ? 'Natal'
        : hkey === 'new_year'
          ? 'Tahun Baru'
          : hkey;
  return pct >= 0 ? (
    <Trans>Libur {label} — perkiraan naik {pct}%</Trans>
  ) : (
    <Trans>Libur {label} — perkiraan turun {Math.abs(pct)}%</Trans>
  );
}

/** Renders a single forecast driver as a localized line. */
export function RenderDriver({ driver }: { driver: ForecastDriver }) {
  if (driver.code === 'holiday') return <HolidayText pct={driver.pct} hkey={driver.key} />;
  if (driver.code === 'weather') {
    if (driver.condition === 'rainy') return <Trans>Hujan — perkiraan turun {Math.abs(driver.pct)}%</Trans>;
    // Defensive: only 'rainy' is emitted in C2b; the C2c taxonomy may add hot/cool.
    return driver.pct >= 0 ? (
      <Trans>Cuaca — perkiraan naik {Math.abs(driver.pct)}%</Trans>
    ) : (
      <Trans>Cuaca — perkiraan turun {Math.abs(driver.pct)}%</Trans>
    );
  }
  const day = DAY_NAMES[driver.dow] ?? '';
  return driver.code === 'dow_busy' ? (
    <Trans>+{driver.pct}% — biasanya ramai di hari {day}</Trans>
  ) : (
    <Trans>{driver.pct}% — biasanya sepi di hari {day}</Trans>
  );
}
