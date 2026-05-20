export function nextPositionAfter(rows: ReadonlyArray<{ position: number }>): number {
  if (rows.length === 0) return 100;
  let max = -Infinity;
  for (const row of rows) {
    if (!Number.isInteger(row.position)) {
      throw new Error(`nextPositionAfter requires integer positions, got ${row.position}`);
    }
    if (row.position > max) max = row.position;
  }
  return max + 100;
}
