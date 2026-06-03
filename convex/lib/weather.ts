import { v } from 'convex/values';

export type WeatherCondition = 'hot' | 'rainy' | 'cool' | 'normal';
export type WeatherDay = {
  dateKey: string;
  condition: WeatherCondition;
  tempMaxC: number;
  precipMm: number;
};

// Shared Convex validators — imported by schema.ts (forecasts.weatherSignal +
// the weather driver arm), forecast.ts (persistForecast args + driverV), and
// demand.ts (computeDemand signature) so the shape is defined once.
export const weatherConditionV = v.union(
  v.literal('hot'),
  v.literal('rainy'),
  v.literal('cool'),
  v.literal('normal')
);
export const weatherDayV = v.object({
  dateKey: v.string(),
  condition: weatherConditionV,
  tempMaxC: v.number(),
  precipMm: v.number(),
});
export const weatherSignalV = v.array(weatherDayV);

/**
 * Derive a coarse weather condition. Rainy takes precedence over hot/cool —
 * rain suppresses sales regardless of temperature. Thresholds are tunable;
 * C2b maps condition → multiplier.
 */
export function conditionOf(tempMaxC: number, precipMm: number): WeatherCondition {
  if (precipMm >= 5) return 'rainy';
  if (tempMaxC >= 32) return 'hot';
  if (tempMaxC < 24) return 'cool';
  return 'normal';
}

/** Open-Meteo geocoding: results[0].latitude/longitude. null when absent. */
export function parseGeocode(json: unknown): { latitude: number; longitude: number } | null {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { latitude?: unknown; longitude?: unknown };
  if (typeof first?.latitude !== 'number' || typeof first?.longitude !== 'number') return null;
  return { latitude: first.latitude, longitude: first.longitude };
}

/**
 * Open-Meteo forecast: daily.time[] (YYYY-MM-DD, already local to the
 * requested timezone), daily.temperature_2m_max[], daily.precipitation_sum[].
 * Zips by index into WeatherDay[]. Returns [] on any malformed/missing array.
 */
export function parseForecast(json: unknown): WeatherDay[] {
  const daily = (json as { daily?: unknown })?.daily as
    | { time?: unknown; temperature_2m_max?: unknown; precipitation_sum?: unknown }
    | undefined;
  const time = daily?.time;
  const temps = daily?.temperature_2m_max;
  const precs = daily?.precipitation_sum;
  if (!Array.isArray(time) || !Array.isArray(temps) || !Array.isArray(precs)) return [];
  const n = Math.min(time.length, temps.length, precs.length);
  const days: WeatherDay[] = [];
  for (let i = 0; i < n; i++) {
    const dateKey = time[i];
    const tempMaxC = temps[i];
    const precipMm = precs[i];
    if (typeof dateKey !== 'string' || typeof tempMaxC !== 'number' || typeof precipMm !== 'number') {
      continue; // skip a single bad day (e.g. Open-Meteo nulls the last day's precip), keep the rest
    }
    days.push({ dateKey, condition: conditionOf(tempMaxC, precipMm), tempMaxC, precipMm });
  }
  return days;
}
