import { Trans } from '@lingui/react/macro';

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        <Trans>atau</Trans>
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
