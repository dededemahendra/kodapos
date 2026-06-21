import type { ReactNode } from 'react';

/**
 * Header for an onboarding step: an iconed badge, a tracking-tight title, and an
 * optional muted description. Keeps the three wizard screens visually identical.
 */
export function OnboardingStepHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground [&_svg]:size-5">
        {icon}
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
