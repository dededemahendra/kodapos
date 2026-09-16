/**
 * Receipt-code lookup, client side.
 *
 * `api.orders.search` matches a 4-character receipt code against the tail of an
 * order's `_id` (online receipts) or its `clientId` (offline ones). It cannot
 * push that comparison into the Convex index filter — the code is a derived
 * string slice, not a stored field — so it narrows only the page it just
 * fetched. Results come back newest-first, which means a receipt from this
 * morning is nowhere near page 1 by the afternoon: the query returns an empty
 * page with `isDone: false`, and the cashier reads a confident "not found" for
 * the exact refund this feature exists to enable.
 *
 * The fix has to live in the caller: keep asking for pages until the code turns
 * up or the range is exhausted. These helpers are the decision half of that
 * loop, kept pure so it can be tested without a DOM or a Convex client (this
 * repo's vitest runs on edge-runtime — no render tests).
 */

/** Receipt codes are always exactly this many characters. */
export const RECEIPT_CODE_LENGTH = 4;

/**
 * Safety stop for the auto-load loop. A date range with tens of thousands of
 * orders and a mistyped code would otherwise walk the entire range one page at
 * a time. Reaching it is reported to the operator rather than swallowed — see
 * `codeSearchExhausted` — because "we stopped looking" and "it isn't there"
 * must never look the same on a refund screen.
 */
export const MAX_CODE_SEARCH_PAGES = 40;

/** Page size the auto-load loop asks for. Larger than the browsing page size:
 *  nobody is reading these rows, they are only being scanned for one code. */
export const CODE_SEARCH_PAGE_SIZE = 100;

/**
 * The query string as the server wants it, or null when the operator has not
 * typed a complete code yet.
 *
 * A partial code returns null rather than a short string on purpose: the server
 * treats a non-4-character query as "matches nothing", so auto-loading on one
 * would page through the whole range to prove a certainty.
 */
export function normalizeReceiptCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length === RECEIPT_CODE_LENGTH ? trimmed : null;
}

/** Whether the operator has typed something that is not yet a usable code. */
export function isPartialReceiptCode(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length !== RECEIPT_CODE_LENGTH;
}

/**
 * Whether the fetched page should render as the order list.
 *
 * A partial code (e.g. "EF1") normalizes to `null` — see
 * `normalizeReceiptCode` — so `q` is never sent and the query quietly returns
 * the whole unfiltered range instead of "no results". Deciding "show the
 * list" from `resultCount > 0` alone would then render every order in range
 * with nothing to say the search was ignored, on a screen used to find a
 * specific sale to refund. The list must never render while a partial code
 * sits in the input, no matter how many unfiltered rows came back; the caller
 * shows the "type 4 characters" hint instead.
 */
export function shouldShowOrderList(rawCode: string, resultCount: number): boolean {
  return !isPartialReceiptCode(rawCode) && resultCount > 0;
}

export type PaginationStatus = 'LoadingFirstPage' | 'LoadingMore' | 'CanLoadMore' | 'Exhausted';

export type CodeSearchState = {
  /** Normalized code, or null when no code search is active. */
  code: string | null;
  /** Rows the paginated query currently holds. */
  resultCount: number;
  status: PaginationStatus;
  /** How many pages this search has already pulled. */
  pagesLoaded: number;
  maxPages?: number;
};

/**
 * Should the caller pull another page?
 *
 * Only while a complete code is being searched, nothing has matched yet, more
 * pages exist, and the safety stop has not been hit. Notably it does NOT fire
 * once a match is in hand: one receipt code is enough to find, and the operator
 * can keep paging by hand if they want the rest.
 */
export function shouldAutoLoadMore(state: CodeSearchState): boolean {
  if (state.code === null) return false;
  if (state.resultCount > 0) return false;
  if (state.status !== 'CanLoadMore') return false;
  return state.pagesLoaded < (state.maxPages ?? MAX_CODE_SEARCH_PAGES);
}

/**
 * True when the loop gave up at the safety stop with nothing found — the one
 * case where "no results" must not be shown as a plain empty state.
 */
export function codeSearchExhausted(state: CodeSearchState): boolean {
  if (state.code === null || state.resultCount > 0) return false;
  if (state.status !== 'CanLoadMore') return false;
  return state.pagesLoaded >= (state.maxPages ?? MAX_CODE_SEARCH_PAGES);
}
