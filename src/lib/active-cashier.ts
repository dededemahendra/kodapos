import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kodapos.activeCashierId';
// The `storage` event only fires in OTHER tabs, so a switch within THIS tab
// must broadcast its own event for sibling hook instances (e.g. a permission
// gate) to re-read and re-render immediately — without a full reload.
const CHANGE_EVENT = 'kodapos:active-cashier-change';

function readFromStorage(): Id<'cafeStaff'> | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (raw as Id<'cafeStaff'>) : null;
}

export function useActiveCashier(): {
  cashierId: Id<'cafeStaff'> | null;
  setCashier: (id: Id<'cafeStaff'>) => void;
  clearCashier: () => void;
} {
  const [cashierId, setCashierId] = useState<Id<'cafeStaff'> | null>(() => readFromStorage());

  useEffect(() => {
    function sync(): void {
      setCashierId(readFromStorage());
    }
    function onStorage(e: StorageEvent): void {
      if (e.key === STORAGE_KEY) sync();
    }
    window.addEventListener('storage', onStorage); // other tabs
    window.addEventListener(CHANGE_EVENT, sync); // this tab
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  function setCashier(id: Id<'cafeStaff'>): void {
    window.localStorage.setItem(STORAGE_KEY, id);
    setCashierId(id);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  function clearCashier(): void {
    window.localStorage.removeItem(STORAGE_KEY);
    setCashierId(null);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return { cashierId, setCashier, clearCashier };
}
