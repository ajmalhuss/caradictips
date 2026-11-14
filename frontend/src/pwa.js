// PWA plumbing: service-worker registration and install-prompt capture.
//
// Kept out of App.jsx so the UI file stays about the tip library. This module has
// no React dependency; App.jsx subscribes via the helpers below.

let deferredPrompt = null;
const listeners = new Set();

// Chrome/Edge/Android fire `beforeinstallprompt` once install criteria are met.
// We stash the event and surface our own button instead of letting the browser
// show its mini-infobar, which users dismiss and never see again.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(canInstall()));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

export function registerServiceWorker() {
  // Only in production builds: a SW caching /src/* during `npm run dev` fights Vite's
  // HMR and serves stale modules. The deploy always builds, so real users get it.
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration is not fatal — the app works online without it.
    });
  });
}

export function canInstall() {
  return deferredPrompt !== null;
}

export function onInstallAvailability(fn) {
  listeners.add(fn);
  fn(canInstall());
  return () => listeners.delete(fn);
}

// Returns "accepted" | "dismissed" | "unavailable".
export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  }
  return outcome;
}

// iOS Safari never fires beforeinstallprompt — installation is Share -> Add to Home
// Screen only, so the UI has to explain it rather than offer a button.
export function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports a desktop Mac UA; the touch-point test catches it.
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOs;
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}