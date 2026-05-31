export type StatusBadgeVariant = 'success' | 'warn' | 'danger' | 'muted';

export const STATUS_BADGE_VARIANTS: readonly StatusBadgeVariant[] = [
  'success',
  'warn',
  'danger',
  'muted',
] as const;

// Foreground + dot tint per variant. The pill chrome (border/rounded/size)
// lives in the component; this maps only the semantic color so it can be
// unit-tested without a DOM.
const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  success: 'text-primary',
  warn: 'text-amber-600',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

export function statusBadgeClasses(variant: StatusBadgeVariant): string {
  return VARIANT_CLASSES[variant];
}
