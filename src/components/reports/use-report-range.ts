import { getRouteApi } from '@tanstack/react-router';
import type { RangeArgs } from 'convex/lib/time';

export type ReportPreset = 'today' | 'yesterday' | 'last7' | 'last30';
export type ReportSearch = { preset: ReportPreset } | { from: string; to: string };

const PRESETS: ReportPreset[] = ['today', 'yesterday', 'last7', 'last30'];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Normalizes raw URL search into a valid ReportSearch (default: today). */
export function parseReportSearch(search: Record<string, unknown>): ReportSearch {
  const from = search.from;
  const to = search.to;
  if (
    typeof from === 'string' &&
    typeof to === 'string' &&
    DATE_KEY.test(from) &&
    DATE_KEY.test(to) &&
    from <= to
  ) {
    return { from, to };
  }
  const preset = search.preset;
  if (typeof preset === 'string' && (PRESETS as string[]).includes(preset)) {
    return { preset: preset as ReportPreset };
  }
  return { preset: 'today' };
}

const routeApi = getRouteApi('/_pos/reports');

export type RangeControls = {
  search: ReportSearch;
  range: RangeArgs;
  setPreset: (preset: ReportPreset) => void;
  setCustom: (from: string, to: string) => void;
};

/** Derive the Convex range args from a validated report search. Shared by every
 * route that exposes a report range (reports, all-outlets). */
export function toRange(search: ReportSearch): RangeArgs {
  return 'from' in search ? { from: search.from, to: search.to } : { preset: search.preset };
}

/** Reads/writes the report range from URL search on the /_pos/reports route. */
export function useReportRange(): RangeControls {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  return {
    search,
    range: toRange(search),
    setPreset: (preset) => navigate({ search: { preset } }),
    setCustom: (from, to) => navigate({ search: { from, to } }),
  };
}
