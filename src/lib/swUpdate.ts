/**
 * Tiny bridge between the service-worker registration (module scope,
 * outside React) and the app's update toast. Prompt-mode updates: the
 * new version installs in the background and waits; the user restarts
 * at a moment THEY chose — never mid-scan, never mid-keystroke.
 */
type Listener = () => void;

let ready = false;
let applyFn: (() => void) | null = null;
const listeners = new Set<Listener>();

export function markUpdateReady(apply: () => void): void {
  ready = true;
  applyFn = apply;
  for (const l of listeners) l();
}

/** Subscribe; fires immediately when an update is already waiting. */
export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  if (ready) listener();
  return () => {
    listeners.delete(listener);
  };
}

export function applyUpdate(): void {
  applyFn?.();
}
