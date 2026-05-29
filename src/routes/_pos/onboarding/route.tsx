import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { useLingui } from '@lingui/react/macro';
import { type WizardStep, WizardStepper } from '~/components/menu/wizard-stepper';

export const Route = createFileRoute('/_pos/onboarding')({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  const { t } = useLingui();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const STEPS: ReadonlyArray<WizardStep> = [
    { label: t`Profil Kafe`, enabled: true },
    { label: t`Menu`, enabled: true },
    { label: t`Pembayaran`, enabled: false },
    { label: t`Kasir`, enabled: true },
  ];

  let currentIndex = 0;
  if (path.includes('/onboarding/menu')) currentIndex = 1;
  else if (path.includes('/onboarding/cashier')) currentIndex = 3;
  return (
    <div className="max-w-3xl mx-auto p-6">
      <WizardStepper steps={STEPS} currentIndex={currentIndex} />
      <Outlet />
    </div>
  );
}
