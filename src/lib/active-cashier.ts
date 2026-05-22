import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kodapos.activeCashierId';

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
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCashierId(readFromStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function setCashier(id: Id<'cafeStaff'>): void {
    window.localStorage.setItem(STORAGE_KEY, id);
    setCashierId(id);
  }

  function clearCashier(): void {
    window.localStorage.removeItem(STORAGE_KEY);
    setCashierId(null);
  }

  return { cashierId, setCashier, clearCashier };
}
