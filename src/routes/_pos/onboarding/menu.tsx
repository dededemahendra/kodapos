import { createFileRoute } from '@tanstack/react-router';

// The onboarding layout (route.tsx) renders the step components directly so it
// can animate the transition between steps; this child route only registers the
// /onboarding/menu URL.
export const Route = createFileRoute('/_pos/onboarding/menu')({
  component: () => null,
});
