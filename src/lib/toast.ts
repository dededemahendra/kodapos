// Single import site for app toasts. Pages import from here, never from
// 'sonner' directly, so the toast backend can change in one place.
export { toast } from 'sonner';
