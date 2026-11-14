import { useCallback, useEffect, useMemo, useState } from "react";
import InstallBanner from "./InstallBanner.jsx";

// All API calls are same-origin relative /api paths. In production the ingress
// routes /api to the backend; in local dev the Vite proxy forwards to :8000.

const CATEGORY_META = {
  warning: {
    label: "Warning signs",
    blurb: "When to get help right away",
    accent: "bg-rose-600",
    chip: "bg-rose-100 text-rose-900 ring-rose-300",
  },
  nutrition: {
    label: "Food & drink",
    blurb: "What to eat more of, and less of",
    accent: "bg-emerald-600",
    chip: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  },
  activity: {
    label: "Activity",
    blurb: "Moving safely, at your own pace",
    accent: "bg-sky-600",
    chip: "bg-sky-100 text-sky-900 ring-sky-300",
  },
  medication: {
    label: "Medicines",
    blurb: "Taking them safely and on time",
    accent: "bg-indigo-600",
    chip: "bg-indigo-100 text-indigo-900 ring-indigo-300",
  },
  monitoring: {
    label: "Monitoring",
    blurb: "What to track and what changes mean",
    accent: "bg-amber-600",
    chip: "bg-amber-100 text-amber-900 ring-amber-300",
  },
  lifestyle: {
    label: "Everyday life",
    blurb: "Sleep, stress, smoking, mood",
    accent: "bg-teal-600",
    chip: "bg-teal-100 text-teal-900 ring-teal-300",
  },
};

const meta = (c) =>
  CATEGORY_META[c] ?? {
    label: c,
    blurb: "",
    accent: "bg-slate-600",
    chip: "bg-slate-100 text-slate-800 ring-slate-300",
  };

// A stable per-browser id, used only to key favourites when there is no SSO
// identity. Not a login, not a security boundary — favourites aren't sensitive.
function clientId() {
  const KEY = "heart-tips-client-id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "storage-unavailable";
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "X-Client-Id": clientId(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

function EmergencyCard() {
  return (
    <section
      aria-labelledby="emergency-heading"
      className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 sm:p-6"
    >
      <h2
        id="emergency-heading"
        className="flex items-center gap-2 text-xl font-bold text-rose-900"
      >
        <span aria-hidden="true" className="text-2xl">⚠️</span>
        Call emergency services if you have
      </h2>
      <ul className="mt-3 space-y-2 text-rose-950">
        <li className="flex gap-2">
          <span aria-hidden="true" className="mt-1 text-rose-600">•</span>
          <span>
            Chest pain or pressure that does not settle, especially spreading to
            the arm, jaw, neck or back
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="mt-1 text-rose-600">•</span>
          <span>
            Sudden severe breathlessness, or breathlessness that wakes you gasping
          </span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="mt-1 text-rose-600">•</span>
          <span>
            A fast or irregular heartbeat with dizziness, chest discomfort or
            near-fainting
          </span>
        </li>
      </ul>
      <p className="mt-3 text-sm font-medium text-rose-900">
        Do not drive yourself. Sit down and call your local emergency number.
      </p>
    </section>
  );
}

function TipCard({ tip, isFav, onToggleFav }) {
  const m = meta(tip.category);
  return (
    <article className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${m.chip}`}
        >
          {m.label}
        </span>
        <button
          type="button"
          onClick={() => onToggleFav(tip.id)}
          aria-pressed={isFav}
          aria-label={
            isFav
              ? `Remove "${tip.title}" from favourites`
              : `Save "${tip.title}" to favourites`
          }
          className={`-mr-1 -mt-1 rounded-xl p-2 text-xl leading-none transition ${
            isFav
              ? "text-amber-500 hover:text-amber-600"
              : "text-slate-300 hover:text-slate-500"
          }`}
        >
          <span aria-hidden="true">{isFav ? "★" : "☆"}</span>
        </button>
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug text-slate-900">
        {tip.title}
      </h3>
      <p className="mt-2 text-slate-700">{tip.body}</p>

      {tip.why && (
        <p className="mt-3 border-l-4 border-slate-200 pl-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-700">Why it helps: </span>
          {tip.why}
        </p>
      )}
    </article>
  );
}

export default function App() {
  const [title, setTitle] = useState("Cardiac Care Tips");
  const [tips, setTips] = useState([]);
  const [total, setTotal] = useState(0);
  const [todays, setTodays] = useState(null);
  const [favIds, setFavIds] = useState([]);
  const [activeCat, setActiveCat] = useState(() => {
    // Honour ?category= so the manifest's "Emergency signs" shortcut opens the app
    // already filtered to warning signs.
    try {
      const c = new URLSearchParams(window.location.search).get("category");
      return c && CATEGORY_META[c] ? c : null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    api("/config")
      .then((d) => {
        setTitle(d.title || "Cardiac Care Tips");
        document.title = d.title || "Cardiac Care Tips";
      })
      .catch(() => {});
    api("/today").then(setTodays).catch(() => setTodays(null));
    api("/favourites")
      .then((d) => setFavIds(d.tip_ids || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (activeCat) params.set("category", activeCat);
    if (debouncedQuery) params.set("q", debouncedQuery);
    api(`/tips?${params.toString()}`)
      .then((d) => {
        if (cancelled) return;
        setTips(d.tips || []);
        setTotal(d.total ?? (d.tips || []).length);
        setError(d.note || null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeCat, debouncedQuery]);

  const favSet = useMemo(() => new Set(favIds), [favIds]);

  const toggleFav = useCallback(
    async (id) => {
      const isFav = favSet.has(id);
      // Optimistic: the list re-renders immediately, then reconciles with the server.
      setFavIds((prev) =>
        isFav ? prev.filter((x) => x !== id) : [...prev, id]
      );
      try {
        await api(`/favourites/${id}`, { method: isFav ? "DELETE" : "POST" });
      } catch {
        setFavIds((prev) =>
          isFav ? [...prev, id] : prev.filter((x) => x !== id)
        );
      }
    },
    [favSet]
  );

  const visible = showFavsOnly ? tips.filter((t) => favSet.has(t.id)) : tips;
  // Warning-sign tips always render at the top of the list, whatever the sort.
  const ordered = useMemo(() => {
    const warnings = visible.filter((t) => t.category === "warning");
    const rest = visible.filter((t) => t.category !== "warning");
    return [...warnings, ...rest];
  }, [visible]);

  const chips = [{ key: null, label: "Everything" }].concat(
    Object.entries(CATEGORY_META).map(([key, m]) => ({ key, label: m.label }))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#tips"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to tips
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl">❤️</span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {title}
            </h1>
          </div>
          <p className="mt-3 max-w-2xl text-slate-600">
            Short, practical tips for living well with heart disease — food,
            movement, medicines and the numbers worth watching. General guidance
            only: follow your own care team's plan where it differs.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <InstallBanner />
        <EmergencyCard />

        {todays && (
          <section
            aria-labelledby="today-heading"
            className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
          >
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2
                id="today-heading"
                className="text-xs font-bold uppercase tracking-widest text-slate-500"
              >
                Today's tip
              </h2>
            </div>
            <div className="p-5 sm:p-6">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${meta(todays.category).chip}`}
              >
                {meta(todays.category).label}
              </span>
              <h3 className="mt-3 text-xl font-semibold leading-snug text-slate-900">
                {todays.title}
              </h3>
              <p className="mt-2 text-slate-700">{todays.body}</p>
              {todays.why && (
                <p className="mt-3 border-l-4 border-slate-200 pl-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">
                    Why it helps:{" "}
                  </span>
                  {todays.why}
                </p>
              )}
            </div>
          </section>
        )}

        <section id="tips" aria-labelledby="all-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="all-heading"
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              Browse all tips
            </h2>
            <button
              type="button"
              onClick={() => setShowFavsOnly((v) => !v)}
              aria-pressed={showFavsOnly}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                showFavsOnly
                  ? "bg-amber-500 text-white ring-amber-500"
                  : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true">★</span> Saved ({favIds.length})
            </button>
          </div>

          <div>
            <label htmlFor="search" className="sr-only">
              Search tips
            </label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — e.g. salt, walking, blood pressure"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap gap-2"
          >
            {chips.map((c) => {
              const active = activeCat === c.key;
              return (
                <button
                  key={c.key ?? "all"}
                  type="button"
                  onClick={() => setActiveCat(c.key)}
                  aria-pressed={active}
                  className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                    active
                      ? "bg-slate-900 text-white ring-slate-900"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {error && (
            <p
              role="status"
              className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"
            >
              {error}
            </p>
          )}

          <p className="text-sm text-slate-500" role="status" aria-live="polite">
            {loading
              ? "Loading tips…"
              : `${ordered.length} of ${total} tips${activeCat ? ` in ${meta(activeCat).label}` : ""}${showFavsOnly ? " (saved only)" : ""}`}
          </p>

          {!loading && ordered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
              <p className="text-slate-600">
                {showFavsOnly
                  ? "You have not saved any tips yet. Tap the star on any tip to keep it here."
                  : "No tips match that search — try a simpler word."}
              </p>
            </div>
          )}

          <div className="grid gap-4">
            {ordered.map((tip) => (
              <TipCard
                key={tip.id}
                tip={tip}
                isFav={favSet.has(tip.id)}
                onToggleFav={toggleFav}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          This app is general education, not medical advice, and it does not
          replace your own care plan. If something feels wrong, contact your care
          team — and in an emergency, call your local emergency number.
        </p>
      </footer>
    </div>
  );
}