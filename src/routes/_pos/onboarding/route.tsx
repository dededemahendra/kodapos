import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { Trans, useLingui } from '@lingui/react/macro';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { BrandMark } from '~/components/brand-mark';
import { DecorIcon } from '~/components/decor-icon';
import { AnimatedGroup } from '~/components/marketing/animated-group';
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

  // Slide direction: advancing slides the next step in from the right, going
  // back slides it in from the left. Tracked across renders since this layout
  // stays mounted while only the step Outlet changes.
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
          {/* Re-keying on the path remounts on each step change, sliding the
              new step in horizontally (direction-aware). The wrapper clips the
              slide so it can't cause horizontal overflow; the decor marks sit
              outside it and stay unclipped. reducedMotion="user" keeps the fade
              but drops the slide for users who ask for less motion. */}
          <div className="overflow-hidden">
            <MotionConfig reducedMotion="user">
              <motion.div
                key={path}
                initial={{ opacity: 0, x: direction * 28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </motion.div>
            </MotionConfig>
          </div>
        </div>
      </AnimatedGroup>
    </div>
  );
}
