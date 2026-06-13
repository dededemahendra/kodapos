export type CSVColumn = { key: string; header: string };

function escapeCSV(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV from rows + ordered columns: RFC 4180 quoting (fields with " , or
 *  newline are quoted; internal " doubled), LF row separator. Header-only
 *  when rows is empty. */
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

/** Parse CSV text into rows of string cells. RFC 4180-ish: double-quoted
 *  fields may contain commas, newlines, and `""` (an escaped `"`); CRLF and
 *  LF row separators are both accepted; a single trailing newline does not
 *  produce an empty trailing row. Pure, no dependencies. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Swallow a CR; the LF (or absence) ends the row.
      if (text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush the final field/row unless the input ended exactly on a row
  // separator (in which case `field` is '' and `row` is empty).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Triggers a client-side download of `csv` as `filename`. */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
