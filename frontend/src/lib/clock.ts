// A clock for labels that count seconds ("hace 12 s", "próxima lectura en 48 s"). Only the small
// components that show them subscribe, so the charts do not re-render every second.
import { useSyncExternalStore } from 'react';
import { Temporal } from 'temporal-polyfill';

let now = Temporal.Now.instant();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(() => {
    now = Temporal.Now.instant();
    listeners.forEach((listener) => listener());
  }, 1000);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useClock(): Temporal.Instant {
  return useSyncExternalStore(subscribe, () => now);
}
