export type TableViewState = 'loading' | 'empty' | 'data';

// Maps the Convex useQuery contract (undefined while loading) plus row count
// to the branch DataTable should render. Pure so it can be tested without a DOM.
export function tableViewState<T>(data: T[] | undefined): TableViewState {
  if (data === undefined) return 'loading';
  if (data.length === 0) return 'empty';
  return 'data';
}
