/**
 * Storage self-defense. Everything lives in one IndexedDB; iOS Safari
 * can evict a browser-tab site's storage after 7 quiet days, and an
 * installed Home Screen app is exempt. The app asks for persistence,
 * knows whether it's installed, and can say how much it's holding —
 * so the user hears about the risk BEFORE it costs them.
 */

export interface StorageHealth {
  /** null = the API doesn't exist here. */
  persisted: boolean | null;
  installed: boolean;
  usageBytes: number | null;
}

/** Installed to the Home Screen (standalone display) vs a browser tab. */
export function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Best-effort: ask the browser to never evict our storage. */
export async function requestPersist(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageHealth(): Promise<StorageHealth> {
  let persisted: boolean | null = null;
  let usageBytes: number | null = null;
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
  } catch {
    /* stays null */
  }
  try {
    if (navigator.storage?.estimate) usageBytes = (await navigator.storage.estimate()).usage ?? null;
  } catch {
    /* stays null */
  }
  return { persisted, installed: isInstalled(), usageBytes };
}
