import { registerSW } from 'virtual:pwa-register';

// Service worker registration plus the two bits of state the UI cares about:
// whether an update is waiting, and whether the app can be installed.
// PwaPrompts.jsx subscribes to this through useSyncExternalStore.

const listeners = new Set();

let snapshot = {
  needRefresh: false,
  canInstall: false,
  installed: false,
};

let deferredPrompt = null;
let updateSW = null;
let started = false;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari, which never fires beforeinstallprompt.
    window.navigator.standalone === true
  );
}

function setState(patch) {
  const next = { ...snapshot, ...patch };
  const changed = Object.keys(next).some((key) => next[key] !== snapshot[key]);
  if (!changed) return;

  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

export function getServerSnapshot() {
  return snapshot;
}

// Shows the browser's own install dialog. Resolves once the user has answered.
export async function promptInstall() {
  if (!deferredPrompt) return false;

  const prompt = deferredPrompt;
  deferredPrompt = null;
  setState({ canInstall: false });

  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

export function dismissInstall() {
  deferredPrompt = null;
  setState({ canInstall: false });
}

// Tells the waiting worker to take over, then reloads.
export function applyUpdate() {
  setState({ needRefresh: false });
  updateSW?.(true);
}

export function initPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;

  setState({ installed: isStandalone() });

  // Has to be attached before the browser fires it, so this runs at import
  // time rather than on load.
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress the default mini-infobar; we surface our own button instead.
    event.preventDefault();
    deferredPrompt = event;
    setState({ canInstall: !isStandalone(), installed: isStandalone() });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setState({ canInstall: false, installed: true });
  });

  window
    .matchMedia('(display-mode: standalone)')
    .addEventListener('change', (event) => {
      if (event.matches) setState({ canInstall: false, installed: true });
    });

  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    // A worker left over from `npm run preview` on this origin would sit in
    // front of the HMR client, so clear it out instead of registering.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) registration.unregister();
    });
    return;
  }

  window.addEventListener('load', () => {
    updateSW = registerSW({
      // We are already past load, so register straight away.
      immediate: true,
      onNeedRefresh() {
        setState({ needRefresh: true });
      },
    });
  });
}
