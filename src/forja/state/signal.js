/* A tiny change signal: engine code mutates its own state objects (big typed arrays live there) and calls
   bump(); React components subscribed with useSignal() render again. */
import { useSyncExternalStore } from 'react';

export function createSignal() {
  let version = 0;
  const subs = new Set();
  return {
    bump() { version++; subs.forEach(f => f()); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    get: () => version
  };
}
export const useSignal = sig => useSyncExternalStore(sig.subscribe, sig.get);

/* a single value with subscribers (messages, flags...) */
export function createValue(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(v) { if (v === value) return; value = v; subs.forEach(f => f()); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); }
  };
}
export const useValue = v => useSyncExternalStore(v.subscribe, v.get);

/* small preferences remembered in this browser (localStorage may be blocked: then nothing is remembered) */
export function prefs(key, initial) {
  let data = initial;
  try { data = { ...initial, ...(JSON.parse(localStorage.getItem(key)) || {}) }; } catch { /* private mode */ }
  return {
    data,
    save() { try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ } }
  };
}
