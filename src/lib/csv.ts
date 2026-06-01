export type CSVColumn = { key: string; header: string };

function escapeCSV(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV from rows + ordered columns. Header-only when rows is empty. */
export function toCSV(
  rows: Array<Record<string, string | number | undefined>>,
  columns: CSVColumn[]
): string {
  const header = columns.map((c) => escapeCSV(c.header)).join(',');
  if (rows.length === 0) return header;
  const body = rows
    .map((r) => columns.map((c) => escapeCSV(r[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

/** Triggers a client-side download of `csv` as `filename`. */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
