import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { Trans, useLingui } from '@lingui/react/macro';
import { AnimatePresence, MotionConfig, motion, type Variants } from 'motion/react';
import { useEffect, useRef } from 'react';
import { BrandMark } from '~/components/brand-mark';
import { DecorIcon } from '~/components/decor-icon';
import { AnimatedGroup } from '~/components/marketing/animated-group';
import { type WizardStep, WizardStepper } from '~/components/menu/wizard-stepper';
import { CashierStep } from '~/components/onboarding/steps/cashier-step';
import { MenuStep } from '~/components/onboarding/steps/menu-step';
import { ProfileStep } from '~/components/onboarding/steps/profile-step';

export const Route = createFileRoute('/_pos/onboarding')({
  component: OnboardingLayout,
});

// Direction-aware horizontal slide. Forward (advancing) brings the new step in
// from the right and pushes the old one off to the left; back reverses it.
const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -40 : 40, opacity: 0 }),
};

function OnboardingLayout() {
  const { t } = useLingui();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const STEPS: ReadonlyArray<WizardStep> = [
    { label: t`Profil Kafe`, enabled: true },
    { label: t`Menu`, enabled: true },
    { label: t`Pembayaran`, enabled: false },
    { label: t`Kasir`, enabled: true },
  ];

  // Resolve the active step from the URL. The wizard renders the step itself
  // (rather than via Outlet) so AnimatePresence can animate the outgoing and
  // incoming steps together — works in every browser, unlike View Transitions.
  const step = path.includes('/onboarding/cashier')
    ? { key: 'cashier', index: 3, node: <CashierStep /> }
    : path.includes('/onboarding/menu')
      ? { key: 'menu', index: 1, node: <MenuStep /> }
      : { key: 'profile', index: 0, node: <ProfileStep /> };

  const currentIndex = step.index;
  const prevIndex = useRef(currentIndex);
  const direction = currentIndex < prevIndex.current ? -1 : 1;
  useEffect(() => {
    prevIndex.current = currentIndex;
  }, [currentIndex]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-muted">
      {/* Soft vignette for depth, theme-aware and subtle on the muted canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_120%_at_50%_-10%,transparent_42%,color-mix(in_oklch,var(--foreground)_7%,transparent)_100%)]"
      />
      <AnimatedGroup className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-10 sm:py-14">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-auto text-primary" />
            <span className="text-lg font-semibold tracking-tight">kodapos</span>
          </div>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <Trans>Penyiapan</Trans>
          </p>
        </div>

        <WizardStepper steps={STEPS} currentIndex={currentIndex} className="mt-8" />

        <div className="relative mt-8 rounded-2xl border border-border bg-background p-6 shadow-xl ring-1 ring-border/50 sm:p-8">
          <DecorIcon position="top-left" />
          <DecorIcon position="top-right" />
          <DecorIcon position="bottom-left" />
          <DecorIcon position="bottom-right" />
          {/* Clip the slide so the exiting/entering steps never overflow the
              card; the decor marks sit outside this wrapper and stay unclipped. */}
          <div className="relative overflow-hidden">
            <MotionConfig reducedMotion="user">
              <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                <motion.div
                  key={step.key}
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {step.node}
                </motion.div>
              </AnimatePresence>
            </MotionConfig>
          </div>
        </div>
      </AnimatedGroup>
    </div>
  );
}
