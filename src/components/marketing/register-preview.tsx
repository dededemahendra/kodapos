/**
 * Decorative, language-neutral mock of the kodapos register (menu grid plus
 * cart), framed like an app screenshot. Uses theme tokens so it reads in light
 * and dark. Purely visual, hidden from assistive tech.
 */
export function RegisterPreview() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-border bg-card">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <div className="ml-3 h-4 w-40 rounded bg-muted" />
      </div>

      {/* screen: menu + cart */}
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_240px]">
        {/* menu pane */}
        <div className="space-y-3">
          <div className="h-8 rounded-md border border-border bg-background" />
          <div className="flex gap-2">
            <span className="h-6 w-16 rounded-md bg-primary" />
            <span className="h-6 w-14 rounded-md bg-muted" />
            <span className="h-6 w-14 rounded-md bg-muted" />
            <span className="hidden h-6 w-14 rounded-md bg-muted sm:block" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-2.5">
                <div className="mb-2 h-10 rounded-md bg-muted/70" />
                <div className="h-2 w-4/5 rounded bg-muted" />
                <div className="mt-1.5 h-2 w-2/5 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>

        {/* cart pane */}
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-3">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="mt-1 h-px bg-border" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="h-2.5 w-1/2 rounded bg-muted" />
              <div className="h-2.5 w-10 rounded bg-muted" />
            </div>
          ))}
          <div className="mt-1 h-px bg-border" />
          <div className="flex items-center justify-between">
            <div className="h-3 w-12 rounded bg-muted" />
            <div className="h-3 w-14 rounded bg-foreground/70" />
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
            <div className="h-9 rounded-lg bg-primary" />
            <div className="h-9 rounded-lg border border-border" />
          </div>
        </div>
      </div>
    </div>
  );
}
