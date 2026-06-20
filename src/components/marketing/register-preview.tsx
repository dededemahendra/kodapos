export function RegisterPreview() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-12 max-w-3xl rounded-2xl border border-border bg-muted/40 p-2.5 shadow-2xl"
    >
      <div className="flex h-8 items-center gap-1.5 px-3">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
      </div>
      <div className="grid min-h-56 grid-cols-1 gap-2 rounded-xl border border-border bg-card p-2.5 sm:grid-cols-[1fr_220px]">
        <div className="grid grid-cols-3 content-start gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-background" />
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <div className="h-2.5 rounded bg-muted" />
          <div className="h-2.5 w-3/5 rounded bg-muted" />
          <div className="h-2.5 rounded bg-muted" />
          <div className="h-2.5 w-2/5 rounded bg-muted" />
          <div className="mt-auto h-9 rounded-lg bg-primary" />
        </div>
      </div>
    </div>
  );
}
