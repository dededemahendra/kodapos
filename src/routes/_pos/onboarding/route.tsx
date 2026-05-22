import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { type WizardStep, WizardStepper } from '~/components/menu/wizard-stepper';

export const Route = createFileRoute('/_pos/onboarding')({
  component: OnboardingLayout,
});

const STEPS: ReadonlyArray<WizardStep> = [
  { label: 'Profil Kafe', enabled: true },
  { label: 'Menu', enabled: true },
  { label: 'Pembayaran', enabled: false },
  { label: 'Kasir', enabled: true },
];

function OnboardingLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
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
