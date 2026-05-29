import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '~/components/dashboard';

export const Route = createFileRoute('/_pos/dashboard')({
  component: Dashboard,
});
