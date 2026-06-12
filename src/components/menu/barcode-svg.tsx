import { useMemo } from 'react';
import { encodeCode128B } from '~/lib/barcode-code128';

/**
 * Renders a scannable Code128-B barcode as an SVG plus the human-readable value
 * below it. Pure presentational — the encoding lives in `~/lib/barcode-code128`.
 *
 * The encoder returns a flat list of module widths that alternate
 * bar/space/bar/space… starting with a bar (black). We walk the widths,
 * accumulating an x offset, and emit a `<rect>` for each black run only.
 */
export function BarcodeSVG({
  value,
  height = 48,
  moduleWidth = 2,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
}) {
  const modules = useMemo(() => {
    try {
      return encodeCode128B(value);
    } catch {
      // An out-of-range character would throw; render nothing rather than
      // crash the whole label page.
      return null;
    }
  }, [value]);

  if (!modules || modules.length === 0) {
    return <div className="font-mono text-xs">{value}</div>;
  }

  const totalModules = modules.reduce((sum, w) => sum + w, 0);
  const totalWidth = totalModules * moduleWidth;

  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  modules.forEach((w, i) => {
    // Even indices are bars (black), odd indices are spaces (white).
    if (i % 2 === 0) {
      bars.push({ x: x * moduleWidth, width: w * moduleWidth });
    }
    x += w;
  });

  return (
    <div className="flex flex-col items-center">
      <svg
        role="img"
        aria-label={value}
        shapeRendering="crispEdges"
        width={totalWidth}
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
      >
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="black"
          />
        ))}
      </svg>
      <div className="font-mono text-xs text-center">{value}</div>
    </div>
  );
}
