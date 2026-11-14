import { useEffect, useState } from "react";
import { canInstall, isIos, isStandalone, onInstallAvailability, promptInstall } from "./pwa.js";

// A dismissible "install this app" prompt. Shown once — dismissal is remembered,
// because a health app that nags is worse than one the user has to find again.
const DISMISS_KEY = "heart-tips-install-dismissed";

export default function InstallBanner() {
  const [installable, setInstallable] = useState(canInstall());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => onInstallAvailability(setInstallable), []);

  // Nothing to offer when already installed, or once dismissed.
  if (isStandalone() || dismissed) return null;

  // Note: no early return when `installable` is false. Android/Chrome fire
  // beforeinstallprompt only once the service worker is active and controlling the
  // page — on a first visit that has not happened yet, so the event is absent and an
  // "only show when installable" banner would render nothing. Instead we always show,
  // and offer the button only when the prompt is genuinely available.
  const showIosHowto = isIos();

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage blocked — the banner just returns next visit */
    }
  };

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") hide();
    else if (outcome === "unavailable") setIosHint(true);
  };

  return (
    <section
      aria-label="Install this app"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <img
          src="/icon-192.png"
          alt=""
          width="44"
          height="44"
          className="mt-0.5 h-11 w-11 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            Keep these tips on your phone
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Install the app to open it from your home screen — and to read the tip
            library without a connection.
          </p>

          {showIosHowto ? (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              On iPhone or iPad: tap the <span className="font-semibold">Share</span>{" "}
              button, then{" "}
              <span className="font-semibold">Add to Home Screen</span>.
            </p>
          ) : installable ? null : (
            // Android/desktop without the prompt yet (first visit, before the service
            // worker takes control). Give the menu route so there is always a way in.
            <p className="mt-2 text-sm text-slate-500">
              On Android: open the browser menu{" "}
              <span aria-hidden="true">⋮</span> and choose{" "}
              <span className="font-semibold">Install app</span> or{" "}
              <span className="font-semibold">Add to Home screen</span>.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {installable && (
              <button
                type="button"
                onClick={install}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={hide}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}