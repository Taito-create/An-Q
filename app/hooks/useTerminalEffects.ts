import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

const KEY = STORAGE_KEYS.TERMINAL_EFFECTS_ENABLED;

/**
 * Read the initial value synchronously on first mount.
 * Web: direct localStorage access prevents a one-frame flicker
 * where effects play briefly before switching to OFF.
 */
function readInitial(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return true;
  }
  try {
    return window.localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * ON/OFF flag for terminal-style effects (typewriter / scramble / blink / pulse).
 * - Default: true (effects ON)
 * - Turning it OFF in Settings switches every effect to instant display
 * - Changes from another tab are picked up via the `storage` event
 */
export function useTerminalEffects(): boolean {
  const [enabled, setEnabled] = useState(readInitial);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === KEY) setEnabled(e.newValue !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return enabled;
}