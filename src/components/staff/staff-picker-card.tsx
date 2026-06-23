import { useLingui } from '@lingui/react/macro';
import { defaultAvatarUrl } from '~/lib/avatar';

export interface StaffPickerCardProps {
  /** Stable, unique seed (the cashier id) for the default avatar. */
  seed: string;
  name: string;
  role: 'owner' | 'cashier';
  hasPin: boolean;
  onClick: () => void;
}

export function StaffPickerCard({ seed, name, role, hasPin, onClick }: StaffPickerCardProps) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={defaultAvatarUrl(seed)}
        alt=""
        loading="lazy"
        className="size-14 rounded-full bg-accent"
      />
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">
        {role === 'owner' ? t`Pemilik` : t`Kasir`}
        {!hasPin && t` · belum ada PIN`}
      </span>
    </button>
  );
}
