import type { ReactNode } from 'react';

export function SectionHeading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mx-auto mb-11 max-w-2xl text-center">
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{children}</h2>
      {sub ? <p className="mt-3 text-lg text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
