export interface StaffPickerCardProps {
  name: string;
  role: 'owner' | 'cashier';
  hasPin: boolean;
  onClick: () => void;
}

export function StaffPickerCard({ name, role, hasPin, onClick }: StaffPickerCardProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center justify-center size-14 rounded-full bg-accent text-primary text-lg font-semibold">
        {initials}
      </span>
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">
        {role === 'owner' ? 'Pemilik' : 'Kasir'}
        {!hasPin && ' · belum ada PIN'}
      </span>
    </button>
  );
}
