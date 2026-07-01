import { createFileRoute, redirect } from '@tanstack/react-router';

// The dedicated signup page is gone: registration now happens inline on
// /signin (enter email, get a code, account is created on first verify).
// Keep this route as a permanent redirect so old links and bookmarks resolve.
export const Route = createFileRoute('/_public/signup')({
  beforeLoad: () => {
    throw redirect({ to: '/signin' });
  },
});
