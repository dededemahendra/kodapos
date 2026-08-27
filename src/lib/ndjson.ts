/**
 * Incremental newline-delimited-JSON parser for a streamed response body.
 * Buffers partial lines, because a network chunk lands wherever it lands — not
 * on a line boundary. A line that will not parse is skipped rather than thrown:
 * one bad line should not abandon a generation that is otherwise arriving.
 */
export function createNdjsonParser(): { push(chunk: string): unknown[]; flush(): unknown[] } {
  let buffer = '';

  const parse = (line: string): unknown[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines.flatMap(parse);
    },
    flush() {
      const rest = buffer;
      buffer = '';
      return parse(rest);
    },
  };
}
