import { useEffect, useState } from 'react';

/**
 * A full-screen loading state that shows a number counting up to 99% instead of
 * a spinner. Loading is indeterminate, so the count eases toward 99 and holds
 * there until the surrounding component unmounts (when the real content loads).
 */
export function LoadingCounter() {
  const [n, setN] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setN((prev) => {
        if (prev >= 99) return 99;
        // Decelerate as it approaches 99 (a natural "almost there" feel).
        const step = Math.max(1, Math.round((99 - prev) / 14));
        return Math.min(99, prev + step);
      });
    }, 70);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="font-bold tabular-nums tracking-tight text-foreground">
        <span className="text-7xl">{n}</span>
        <span className="align-top text-3xl text-muted-foreground">%</span>
      </div>
    </div>
  );
}
