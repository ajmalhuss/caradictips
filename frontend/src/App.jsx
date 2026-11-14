import { useCallback, useEffect, useMemo, useState } from "react";
import InstallBanner from "./InstallBanner.jsx";

// All API calls are same-origin relative /api paths. In production the ingress
// routes /api to the backend; in local dev the Vite proxy forwards to :8000.

const CATEGORY_META = {
  warning: {
    label: "Warning signs",
    blurb: "When to get help right away",
    icon: "⚠️",
    accent: "bg-rose-600",
    bar: "bg-rose-500",
    chip: "bg-rose-100 text-rose-900 ring-rose-200",
    chipActive: "bg-rose-700 text-white ring-rose-700",
  },
  nutrition: {
    label: "Food & drink",
    blurb: "What to eat more of, and less of",
    icon: "🥗",
    accent: "bg-emerald-600",
    bar: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    chipActive: "bg-emerald-700 text-white ring-emerald-700",
  },
  activity: {
    label: "Activity",
    blurb: "Moving safely, at your own pace",
    icon: "🚶",
    accent: "bg-sky-600",
    bar: "bg-sky-500",
    chip: "bg-sky-100 text-sky-900 ring-sky-200",
    chipActive: "bg-sky-700 text-white ring-sky-700",
  },
  medication: {
    label: "Medicines",
    blurb: "Taking them safely and on time",
    icon: "💊",
    accent: "bg-indigo-600",
    bar: "bg-indigo-500",
    chip: "bg-indigo-100 text-indigo-900 ring-indigo-200",
    chipActive: "bg-indigo-700 text-white ring-indigo-700",
  },
  monitoring: {
    label: "Monitoring",
    blurb: "What to track and what changes mean",
    icon: "🩺",
    accent: "bg-amber-600",
    bar: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900 ring-amber-200",
    chipActive: "bg-amber-700 text-white ring-amber-700",
  },
  lifestyle: {
    label: "Everyday life",
    blurb: "Sleep, stress, smoking, mood",
    icon: "🌿",
    accent: "bg-teal-600",
    bar: "bg-teal-500",
    chip: "bg-teal-100 text-teal-900 ring-teal-200",
    chipActive: "bg-teal-700 text-white ring-teal-700",
  },
};

// Tips fetched per page. Large enough that the 26-tip library is one request,
// small enough that growth does not mean one enormous response.
const PAGE_SIZE = 50;

const meta = (c) =>
  CATEGORY_META[c] ?? {
    label: c,
    blurb: "",
    icon: "",
    accent: "bg-slate-600",
    bar: "bg-slate-400",
    chip: "bg-slate-100 text-slate-800 ring-slate-200",
    chipActive: "bg-slate-800 text-white ring-slate-800",
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
  const data = await res.json();
  // The service worker marks responses it answered from its cache. Carry that
  // through as plain data so the UI can show how old what it is reading is.
  if (res.headers.get("X-From-Cache")) {
    const age = Number(res.headers.get("X-Cached-Age"));
    Object.defineProperty(data, "__cache", {
      value: { ageSeconds: Number.isFinite(age) ? age : null },
      enumerable: false,
    });
  }
  return data;
}

// "3 days ago" / "just now" — coarse on purpose; a patient does not need seconds.
function describeAge(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return "an earlier visit";
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// "Reviewed 12 March 2026". Never invents a date: an unreviewed tip says so.
function reviewLabel(tip) {
  if (!tip?.reviewed_on) return "Not yet clinically reviewed";
  const d = new Date(`${tip.reviewed_on}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Review date unavailable";
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return tip.reviewed_by
    ? `Clinically reviewed ${date} by ${tip.reviewed_by}`
    : `Clinically reviewed ${date}`;
}

function HeartMark({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 21s-7.5-4.8-9.6-9.2C.8 8.4 2.6 4.7 6.1 4.1c2.3-.4 4.4.7 5.9 2.6 1.5-1.9 3.6-3 5.9-2.6 3.5.6 5.3 4.3 3.7 7.7C19.5 16.2 12 21 12 21Z" />
    </svg>
  );
}

function SearchIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function EmergencyCard() {
  return (
    <section
      aria-labelledby="emergency-heading"
      className="overflow-hidden rounded-2xl border-2 border-rose-300 bg-white shadow-card"
    >
      <div className="flex items-center gap-3 bg-rose-700 px-5 py-3.5 sm:px-6">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-lg"
        >
          ⚠️
        </span>
        <h2
          id="emergency-heading"
          className="text-lg font-bold leading-snug text-white sm:text-xl"
        >
          Call emergency services if you have
        </h2>
      </div>
      <ul className="space-y-3 bg-rose-50 px-5 py-5 text-rose-950 sm:px-6">
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600"
          />
          <span>
            Chest pain or pressure that does not settle, especially spreading to
            the arm, jaw, neck or back
          </span>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600"
          />
          <span>
            Sudden severe breathlessness, or breathlessness that wakes you gasping
          </span>
        </li>
        <li className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600"
          />
          <span>
            A fast or irregular heartbeat with dizziness, chest discomfort or
            near-fainting
          </span>
        </li>
      </ul>
      <p className="border-t border-rose-200 bg-rose-100 px-5 py-3 text-sm font-semibold text-rose-900 sm:px-6">
        Do not drive yourself. Sit down and call your local emergency number.
      </p>
    </section>
  );
}

function CategoryChip({ category, className = "" }) {
  const m = meta(category);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${m.chip} ${className}`}
    >
      {m.icon && <span aria-hidden="true">{m.icon}</span>}
      {m.label}
    </span>
  );
}

function WhyItHelps({ children }) {
  return (
    <p className="mt-3 rounded-r-lg border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <span className="font-semibold text-slate-700">Why it helps: </span>
      {children}
    </p>
  );
}

function TipCard({ tip, isFav, onToggleFav }) {
  const m = meta(tip.category);
  const isWarning = tip.category === "warning";
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white p-5 pl-6 shadow-card ring-1 ring-slate-200 transition hover:shadow-card-hover print-tip lg:col-span-1 ${
        isWarning ? "lg:col-span-2" : ""
      }`}
    >
      {/* Category colour as a quiet spine rather than a loud header — it gives the
          list scannability without competing with the tip text. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1.5 ${m.bar}`}
      />

      <div className="flex items-start justify-between gap-3">
        <CategoryChip category={tip.category} />
        <button
          type="button"
          onClick={() => onToggleFav(tip.id)}
          aria-pressed={isFav}
          aria-label={
            isFav
              ? `Remove "${tip.title}" from favourites`
              : `Save "${tip.title}" to favourites`
          }
          className={`no-print -mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-xl text-xl leading-none transition ${
            isFav
              ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
              : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
          }`}
        >
          <span aria-hidden="true">{isFav ? "★" : "☆"}</span>
        </button>
      </div>

      <h3 className="mt-3 text-lg font-semibold leading-snug text-slate-900">
        {tip.title}
      </h3>
      <p className="mt-2 text-slate-700">{tip.body}</p>

      {tip.why && <WhyItHelps>{tip.why}</WhyItHelps>}

      <p className="mt-auto pt-3 text-xs text-slate-500">
        {reviewLabel(tip)}
        {tip.source && (
          <span className="print-source"> · Source: {tip.source}</span>
        )}
      </p>
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cachedAge, setCachedAge] = useState(null);

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

  const queryString = useCallback(
    (offset) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (offset) params.set("offset", String(offset));
      if (activeCat) params.set("category", activeCat);
      if (debouncedQuery) params.set("q", debouncedQuery);
      return params.toString();
    },
    [activeCat, debouncedQuery]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCachedAge(null);
    api(`/tips?${queryString(0)}`)
      .then((d) => {
        if (cancelled) return;
        setTips(d.tips || []);
        setTotal(d.total ?? (d.tips || []).length);
        setHasMore(Boolean(d.has_more));
        setError(d.note || null);
        setCachedAge(d.__cache ? d.__cache.ageSeconds : null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  // Fetch the next page and append. Warning tips are added in their own order and
  // re-sorted by `ordered` below, so appending cannot bury one.
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const d = await api(`/tips?${queryString(tips.length)}`);
      setTips((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return prev.concat((d.tips || []).filter((t) => !seen.has(t.id)));
      });
      setTotal(d.total ?? total);
      setHasMore(Boolean(d.has_more));
      if (d.__cache) setCachedAge(d.__cache.ageSeconds);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

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
    Object.entries(CATEGORY_META).map(([key, m]) => ({
      key,
      label: m.label,
      icon: m.icon,
      activeClass: m.chipActive,
    }))
  );

  const clearFilters = () => {
    setQuery("");
    setActiveCat(null);
    setShowFavsOnly(false);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#tips"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to tips
      </a>

      <header className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-50 via-white to-white"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-rose-100/50 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 py-9 sm:px-6 sm:py-11">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-rose-700 text-white shadow-lg shadow-rose-700/25">
              <HeartMark className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-bold tracking-tight text-slate-900 sm:text-4xl">
                {title}
              </h1>
              <p className="mt-1 text-sm font-medium text-rose-800">
                Food · movement · medicines · warning signs
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-slate-600">
            Short, practical tips for living well with heart disease — food,
            movement, medicines and the numbers worth watching. General guidance
            only: follow your own care team's plan where it differs.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <InstallBanner />
        <EmergencyCard />

        {/* F5.8: if what is on screen came from the offline cache, say so and say
            how old it is. A tip read weeks ago must not look like today's. */}
        {cachedAge !== null && (
          <p
            role="status"
            className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200"
          >
            You are viewing a saved copy from {describeAge(cachedAge)}. It may not
            include the newest tips — connect to the internet to refresh.
          </p>
        )}

        {todays && (
          <section
            aria-labelledby="today-heading"
            className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-5 py-3 sm:px-6">
              <h2
                id="today-heading"
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-rose-600"
                />
                Today's tip
              </h2>
              <CategoryChip category={todays.category} />
            </div>
            <div className="p-5 sm:p-6">
              <h3 className="text-xl font-semibold leading-snug text-slate-900">
                {todays.title}
              </h3>
              <p className="mt-2 text-slate-700">{todays.body}</p>
              {todays.why && <WhyItHelps>{todays.why}</WhyItHelps>}
              <p className="mt-3 text-xs text-slate-500">
                {reviewLabel(todays)}
              </p>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowFavsOnly((v) => !v)}
                aria-pressed={showFavsOnly}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 transition ${
                  showFavsOnly
                    ? "bg-amber-500 text-white ring-amber-500"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                }`}
              >
                <span aria-hidden="true">★</span> Saved ({favIds.length})
              </button>
              {/* F6.9: paper is still the medium many of these users trust. The
                  button prints the warning card plus whatever is on screen. */}
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                <span aria-hidden="true">🖨</span> Print
              </button>
            </div>
          </div>

          {/* P5/F4.8: favourites live in this browser only. Say it here, where the
              user is looking at the Saved button, not only in the docs. */}
          <p className="text-sm text-slate-600">
            <span aria-hidden="true">★</span> Saved tips are kept on this device
            and this browser only. They are not an account: clearing your browsing
            data, or using a different phone or browser, will not carry them over.
          </p>

          <div className="no-print space-y-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 sm:p-5">
            <div className="relative">
              <label htmlFor="search" className="sr-only">
                Search tips
              </label>
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — e.g. salt, walking, blood pressure"
                className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
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
                        ? c.activeClass ||
                          "bg-slate-900 text-white ring-slate-900"
                        : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {c.icon && (
                      <span aria-hidden="true" className="mr-1.5">
                        {c.icon}
                      </span>
                    )}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p
              role="status"
              className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <p
              className="text-sm font-medium text-slate-600 tabular-nums"
              role="status"
              aria-live="polite"
            >
              {loading
                ? "Loading tips…"
                : `${ordered.length} of ${total} tips${activeCat ? ` in ${meta(activeCat).label}` : ""}${showFavsOnly ? " (saved only)" : ""}`}
            </p>
            {!loading && (query || activeCat || showFavsOnly) && (
              <button
                type="button"
                onClick={clearFilters}
                className="no-print rounded-lg px-2 py-1 text-sm font-medium text-rose-700 underline decoration-rose-300 underline-offset-4 hover:bg-rose-50"
              >
                Clear filters
              </button>
            )}
          </div>

          {!loading && ordered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-slate-200">
              <p className="text-slate-600">
                {showFavsOnly
                  ? "You have not saved any tips yet. Tap the star on any tip to keep it here."
                  : "No tips match that search — try a simpler word."}
              </p>
              {!showFavsOnly && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-1">
            {ordered.map((tip) => (
              <TipCard
                key={tip.id}
                tip={tip}
                isFav={favSet.has(tip.id)}
                onToggleFav={toggleFav}
              />
            ))}
          </div>

          {hasMore && (
            <div className="no-print flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more tips"}
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <div className="rounded-2xl bg-white px-4 py-4 shadow-card ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">
            This app is general education, not medical advice, and it does not
            replace your own care plan. If something feels wrong, contact your care
            team — and in an emergency, call your local emergency number.
          </p>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Each tip names the published guidance it is based on. Where a tip shows
            a review date it has been clinically checked; where no date is shown, it
            has not yet been reviewed.
          </p>
        </div>
      </footer>
    </div>
  );
}