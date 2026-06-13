import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useActiveCashier } from './active-cashier';
import { getAutoLockMinutes } from './preferences';

// Screens that are themselves the lock/entry flow — auto-locking here is
// pointless (and would fight the wizard navigation).
const EXEMPT_PREFIXES = ['/pin', '/onboarding'];

const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
] as const;

/**
 * Returns the register to the PIN screen after a configurable idle period
 * (Settings → Umum → Keamanan → "Kunci otomatis saat tidak aktif"). The timeout
 * is re-read from localStorage on each activity tick, so changing it in settings
 * applies immediately. A disabled setting (`0`) arms nothing.
 *
 * Mounted once inside the authenticated POS layout.
 */
export function useAutoLock(): void {
  const navigate = useNavigate();
  const { cashierId, clearCashier } = useActiveCashier();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const exempt = EXEMPT_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  // Keep the latest values in a ref so the activity listeners (registered once)
  // always see current state without re-subscribing on every navigation.
  const stateRef = useRef({ exempt, cashierId, clearCashier, navigate });
  stateRef.current = { exempt, cashierId, clearCashier, navigate };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function lock(): void {
      const { cashierId: id, clearCashier: clear, navigate: nav } =
        stateRef.current;
      if (id) clear();
      void nav({ to: '/pin' });
    }

    function arm(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      const { exempt: isExempt } = stateRef.current;
      const minutes = getAutoLockMinutes();
      if (isExempt || minutes <= 0) return;
      timer = setTimeout(lock, minutes * 60_000);
    }

    arm();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, arm, { passive: true });
    }
    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, arm);
    };
    // Re-arm when navigating onto/off an exempt screen.
  }, [exempt]);
}
