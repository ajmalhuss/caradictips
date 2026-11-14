# Product Requirements Document — Cardiac Care Tips

**Status:** v1 · living document
**Owner:** TBD (see §11 Open questions)
**Last updated:** 2026-11-14
**Shipped surface documented against:** `backend/main.py`, `frontend/src/App.jsx`, `V1__init.sql`, commit `3403506`

> **How to read this.** This app already exists and is deployed. So the PRD does two jobs:
> **(a)** it pins down what v1 is and why, and **(b)** it states the requirements v1 does
> *not* yet meet. Every requirement carries a status — `SHIPPED` (verified in the code),
> `GAP` (required, absent), or `PROPOSED` (nice to have). Nothing here is aspirational
> hand-waving; each `SHIPPED` line points at the code that satisfies it.

---

## 1. Problem

Someone diagnosed with heart disease is handed a lot of instructions at a bad moment —
often during or right after a hospital stay — and is expected to remember them for years.
What actually changes outcomes is unglamorous and repetitive: less salt, keep walking,
take the pills every day, weigh yourself, know your numbers, know when to call for help.
That knowledge is scattered across leaflets that get lost, clinic websites that are hard
to read, and advice that assumes a level of health literacy many patients don't have.

Existing options fail the audience in predictable ways:

- **Too much.** Long articles requiring sustained attention and scrolling.
- **Too small.** Text sized for people who don't need reading glasses.
- **Not actionable.** "Maintain a heart-healthy diet" without the one change to make first.
- **Unsourced/unexplained.** Told *what* to do, never *why*, so it doesn't survive contact
  with a habit.
- **Wrong moment.** Warning signs buried three levels deep instead of visible on arrival.

## 2. Product summary

A single-page, installable web app holding a short library of practical tips for living
with heart disease — searchable and filterable — with a permanent emergency warning-signs
card at the top that is never more than one tap away, even offline.

**The core insight the product is built on:** a small number of *short* tips that each
explain *why they help* beats a comprehensive library that gets abandoned. The rationale
line ("Why it helps:") is the app's main claim to being more than a list and must be
treated as a content requirement, not decoration.

## 3. Goals

| # | Goal | Measure |
|---|---|---|
| G1 | A user can find a relevant tip in under 15 seconds | Search/filter present on first screen; ≤ 2 interactions to any tip |
| G2 | Warning signs are always visible, including offline | Emergency card rendered without any network call; cached by the SW |
| G3 | Every tip explains why it helps | 100% of tips have a non-empty `why` |
| G4 | Readable by an older, lower-health-literacy audience | WCAG 2.2 AA; base font ≥ 1.0625rem; ≥ 44px tap targets |
| G5 | Works on a poor connection | App shell + last tip list served from cache; browseable offline |

## 4. Non-goals

Explicitly out of scope. Several of these are the *reason* the app is safe to ship — do
not let them creep in as "small additions".

| Non-goal | Why |
|---|---|
| Diagnosis, dosing, or titration advice | Would require regulatory clearance and real clinical liability |
| Replacing the care team or a care plan | Reinforced in the UI copy and in a seeded tip (id 26) |
| Symptom checking / triage | Cannot be made safe without clinical decision support and liability cover |
| Personal health record, BP/weight logging, trends | Different product; creates a data-sensitivity obligation the current design deliberately avoids |
| Accounts / login | Platform SSO is app-level; the app is intentionally public (see §8.1) |
| Two-way messaging with clinicians | Needs a care-team integration that doesn't exist |
| Non-English content (v1) | `lang="en"` throughout; localisation is a separate effort (§10 R5) |

## 5. Users

### 5.1 Primary — recent cardiac patient ("Margaret", 68)

Discharged two weeks ago after a stent. On four medications. Reads on an Android phone
she half-remembers how to use. Not confident with technology, takes things literally.
**Needs:** the important thing now, in big text, with a reason to believe it. **Fears:**
missing a warning sign; doing something wrong. **Behaviour:** will scroll, will not read
paragraphs, may install to home screen if told to, will not create an account.

### 5.2 Secondary — ongoing patient ("Dev", 54)

Diagnosed three years ago, managing well, sees the app occasionally. Wants the specific
tip, plus a place to keep the handful that matter to him. **Needs:** fast search, save.
This is the user the favourites feature exists for.

### 5.3 Tertiary — carer or family member ("Priya", 41)

Looks after a parent. Sends a link or installs it on the parent's phone. Needs the app to
explain itself in one screen and to be safe to hand over unattended — which is why the
emergency card and the "not your care plan" footer are always present.

### 5.4 Non-user — the clinician

Not a user of the app, but a **stakeholder in the content**. Every tip is a claim made in
the clinic's voice. See §7.

## 6. Functional requirements

Status legend: `SHIPPED` = exists and verified in code · `GAP` = required for a credible
v1, not built · `PROPOSED` = considered, not committed.

### 6.1 Emergency warning signs (highest-priority surface)

| ID | Requirement | Status |
|---|---|---|
| F1.1 | A fixed warning-signs card is rendered on every page load, above the fold of the library, with no user action required | SHIPPED — `EmergencyCard` in `App.jsx:82`, rendered unconditionally at `App.jsx:288` |
| F1.2 | The card covers chest pain, severe breathlessness, and irregular heartbeat with dizziness — the three presentations a cardiac patient is most likely to misread as "not that serious" | SHIPPED — three `<li>` items, `App.jsx:96-116` |
| F1.3 | The card instructs the user not to drive themselves and to call their local emergency number | SHIPPED — `App.jsx:117-119` |
| F1.4 | Warning-sign content must never appear only in the daily rotation or behind a filter | SHIPPED — excluded from `/api/today` (`main.py:220-230`) *and* re-sorted to the top of every list (`App.jsx:251-255`) |
| F1.5 | The card is available offline | SHIPPED — static JSX, no API call; shell cached by `sw.js` |
| F1.6 | The card is reachable as a PWA shortcut (long-press the icon → "Emergency signs") | SHIPPED — `manifest.webmanifest` shortcuts → `/?category=warning`; `App.jsx:174-183` honours it |
| F1.7 | Emergency number must not be hard-coded to one country | SHIPPED — copy says "your local emergency number" |
| F1.8 | The wording of the card is clinically reviewed and the review is recorded with a date | GAP — no reviewer, no review date anywhere in the product or repo |

**F1.8 is the most important unbuilt requirement in this document.** See §7.1.

### 6.2 Tip library

| ID | Requirement | Status |
|---|---|---|
| F2.1 | Tips are grouped into six fixed categories: warning, nutrition, activity, medication, monitoring, lifestyle | SHIPPED — `CATEGORY_ORDER` (`main.py:110`), `CATEGORY_META` (`App.jsx:7`) |
| F2.2 | Every tip has a one-sentence title, a 2–5 sentence body, and a rationale | SHIPPED — all 26 rows |
| F2.3 | Every tip's `why` is non-empty and rendered as a visually subordinate aside | SHIPPED — 26/26 populated; rendering at `App.jsx:158-163` |
| F2.4 | Tips ordered by an editorial `sort_order`, not insertion order | SHIPPED — tens per category; `ORDER BY sort_order, id` |
| F2.5 | A daily tip is shown, stable across reloads and identical for all users on a given day | SHIPPED — `date.toordinal() % n` offset over non-warning tips, `main.py:210-235` |
| F2.6 | The UI re-sorts any visible warning tip to the top regardless of filter | SHIPPED — `App.jsx:251-255` |
| F2.7 | A user can filter by one category at a time, plus "Everything" | SHIPPED — chips, `App.jsx:257-259`, `361-384` |
| F2.8 | An unknown category still renders (grey chip) rather than breaking | SHIPPED — `meta()` fallback, `App.jsx:46-52`; backend appends unknown categories |
| F2.9 | Tip count is announced to assistive tech as it changes | SHIPPED — `role="status" aria-live="polite"`, `App.jsx:395` |
| F2.10 | Empty search results show a recovery hint ("try a simpler word") | SHIPPED — `App.jsx:401-409` |
| F2.11 | Library can be paged rather than truncated | GAP — `/api/tips` has `limit` (max 200) but **no `offset`** (`main.py:184`). At 26 rows irrelevant; blocks growth past ~200 |

### 6.3 Search

| ID | Requirement | Status |
|---|---|---|
| F3.1 | Free-text search across title, body and rationale | SHIPPED — `title LIKE / body LIKE / why LIKE`, `main.py:193-196` |
| F3.2 | Case-insensitive matching | SHIPPED — `utf8mb4_unicode_ci` collation |
| F3.3 | Input debounced so typing doesn't issue a request per keystroke | SHIPPED — 250 ms, `App.jsx:191-194` |
| F3.4 | Stale responses cannot overwrite fresher ones | SHIPPED — `cancelled` flag, `App.jsx:209-227` |
| F3.5 | Search tolerates the audience's likely spellings of health terms | GAP — substring match only: no stemming, fuzziness or synonym mapping. "fiber" misses "fibre"; "BP" misses "blood pressure"; a typo returns nothing. This is a real usability failure for §5.1 |
| F3.6 | Search works offline against cached content | PARTIAL — the SW only caches exact request URLs already visited; an offline search for a new term hits the network and returns the offline stub. Documented honestly in `sw.js` |

### 6.4 Favourites

| ID | Requirement | Status |
|---|---|---|
| F4.1 | A user can star/unstar any tip | SHIPPED — `POST`/`DELETE /api/favourites/{tip_id}` |
| F4.2 | Toggling is optimistic; a failed write rolls the UI back | SHIPPED — `App.jsx:231-247` |
| F4.3 | Adding an existing favourite is a no-op, not an error | SHIPPED — `INSERT IGNORE` + unique key `uq_fav_user_tip` |
| F4.4 | Favouriting a nonexistent tip is rejected | SHIPPED — `404`, `main.py:262-264` |
| F4.5 | Removing a non-favourite is a no-op | SHIPPED — plain `DELETE`, always `ok: true` |
| F4.6 | A "Saved (n)" toggle filters the library to favourites | SHIPPED — `App.jsx:333-344` |
| F4.7 | Favourites require no account | SHIPPED — per-browser UUID (`localStorage`), `App.jsx:56-68` |
| F4.8 | Favourites survive browser storage being cleared or the user switching device | **GAP — accepted limitation, see §8.1.** Clearing site data loses every favourite; a new phone starts empty. Must be disclosed in-product before this is considered done |
| F4.9 | Writes are not attempted offline (no silent queue) | SHIPPED — SW never intercepts non-GET; UI rolls back |
| F4.10 | Favourites writes are rate-limited | GAP — unauthenticated, unbounded. Any script can insert unlimited rows with arbitrary `X-Client-Id` values. Low impact (small rows, no PII) but an unbounded-growth hole |

### 6.5 Installation & offline

| ID | Requirement | Status |
|---|---|---|
| F5.1 | App is installable (manifest, icons, service worker, standalone display) | SHIPPED — `manifest.webmanifest`, 11 icons, incl. maskable |
| F5.2 | Install prompt is offered, and dismissal is remembered permanently | SHIPPED — `InstallBanner.jsx`, `DISMISS_KEY` |
| F5.3 | iOS users get Share → Add to Home Screen instructions instead of a button | SHIPPED — `isIos()`, `pwa.js` |
| F5.4 | Read-only content is served cache-first (stale-while-revalidate) | SHIPPED — `CACHEABLE_API` regex, `sw.js` |
| F5.5 | Service worker never caches `/health` or any write | SHIPPED — explicit guards, `sw.js` |
| F5.6 | A deploy invalidates old caches | SHIPPED — versioned cache names, `activate` prune |
| F5.7 | Service worker is not registered in dev builds | SHIPPED — `import.meta.env.PROD` guard |
| F5.8 | Offline shows cached content, clearly labelled as possibly stale | PARTIAL — offline stub says "You're offline — showing saved content only." but there is no *staleness timestamp*; a tip cached weeks ago is indistinguishable from today's |

### 6.6 Presentation & accessibility

| ID | Requirement | Status |
|---|---|---|
| F6.1 | Base font 1.0625rem / 1.65 line-height; generous tap targets | SHIPPED — `tailwind.config.js` |
| F6.2 | Visible `:focus-visible` ring on every interactive element | SHIPPED — `index.css` |
| F6.3 | Skip link to the tip list | SHIPPED — `App.jsx:263-268` |
| F6.4 | Respect `prefers-reduced-motion` | SHIPPED — `index.css` |
| F6.5 | Star button has an `aria-pressed` state and a descriptive label naming the tip | SHIPPED — `App.jsx:134-150` |
| F6.6 | Category filters form a labelled group with pressed state | SHIPPED — `role="group"` + `aria-pressed` |
| F6.7 | Layout is single-column and readable at 320px and at 200% zoom | SHIPPED (verify per release — no automated check) |
| F6.8 | Meets WCAG 2.2 AA, verified by audit, not by inspection | GAP — the practices are good but nothing is measured. No contrast audit, no screen-reader pass, no automated a11y check in the build |
| F6.9 | A printable one-page version of the emergency card / saved tips | PROPOSED — §5.1 users frequently want paper; high value, low cost |

### 6.7 Configuration

| ID | Requirement | Status |
|---|---|---|
| F7.1 | Display name is server-supplied, not hard-coded in the bundle | SHIPPED — `APP_TITLE` → `/api/config` → `App.jsx:197-202` sets header and `document.title` |
| F7.2 | Config is fetched at runtime, so renaming needs no rebuild | SHIPPED |

## 7. Content & clinical requirements

This is a patient-education product. The content *is* the product, and it carries the
product's only real risk. These requirements constrain what may be written.

### 7.1 The requirements

| ID | Requirement | Status |
|---|---|---|
| C1 | **Clinical sign-off.** Every tip and the emergency card are reviewed and approved by a named, qualified clinician before publishing | GAP |
| C2 | **Review date in-product.** Each tip shows when it was last clinically reviewed, and the app surfaces content older than its review interval | GAP |
| C3 | **No dosing advice.** No dose, titration, or "take X mg" language anywhere | SHIPPED — zero dosing language in all 26 tips |
| C4 | **No number that could override a care plan.** Thresholds are framed as "ask your care team", not as rules | SHIPPED — e.g. "aim for under about a teaspoon of salt", "seven to nine hours", both with explicit deferral |
| C5 | **Always defer.** A tip stating the app is education and not a care plan is seeded and pinned in the warning category | SHIPPED — tip id 26, `sort_order` 540 |
| C6 | **`why` is mandatory.** No tip ships without a rationale | SHIPPED in data (26/26); **not enforced** in schema or CI |
| C7 | **Warning content is never diluted.** Emergency-sign copy is not softened, merged into a general tip, or moved into the rotation | SHIPPED — enforced by `CATEGORY_ORDER` and the exclusion in `/api/today` |
| C8 | **Cited sources.** Tips trace to a guideline or source (e.g. a national cardiac society) recorded alongside the content | GAP — no source field, no provenance |
| C9 | **Change control.** Content changes are reviewed, and the diff is attributable to a reviewer | GAP in process terms — changes are migrations in git (good audit trail) but nothing requires sign-off |

### 7.2 Why C1/C2/C8 are P0, not polish

An app that says "call emergency services for chest pain that does not settle" is making
a clinical assertion to a person who may act on it. Two failure modes matter:

1. **A wrong or aged claim** is acted on because it appears authoritative and official-looking.
2. **The absence of a review date** removes the reader's only means of judging whether the
   advice is current — which for cardiac guidance is a live concern, not a theoretical one.

Neither is solved by the app's careful tone. They are solved by attribution and a review
cadence. Until C1, C2 and C8 ship, the app is best described as *well-written general
education based on common guidance*, not as *reviewed medical content* — and the copy
should not imply otherwise.

## 8. Privacy, safety and trust

### 8.1 Identity and favourites

Favourites are keyed by `_user_key()` (`main.py:120-137`) in this order:

1. `X-Forwarded-Email` — unspoofable only while platform SSO is enabled.
2. `X-Client-Id` — a random UUID the frontend persists in `localStorage`.
3. Neither → the endpoints return `ok: false, note: "no user identity"`.

**SSO is deliberately off for this app**, so in practice every user is case 2. The
consequences are accepted and must be disclosed, not designed around:

- Favourites are per-browser and do not follow the user across devices.
- Clearing site data loses them irreversibly.
- The key is a convenience identifier, **never** access control — anyone can send any
  value. Favourites are non-sensitive and this is acceptable; real data must never be
  gated on it.

| ID | Requirement | Status |
|---|---|---|
| P1 | No personal health information (PHI) is stored | SHIPPED — schema holds content and an opaque key only |
| P2 | No analytics, trackers, third-party scripts, or cookies | SHIPPED — no third-party script tags; the only client storage is the ID and a dismissal flag |
| P3 | No account creation, no email capture, no profiling | SHIPPED |
| P4 | Favourites are opaque to the operator: `user_key` is a random identifier, not an email (with SSO off) | SHIPPED |
| P5 | The per-browser limitation is explained in the UI, not just in docs | GAP — a user who loses favourites today gets no explanation and no warning |
| P6 | Rate limiting on write endpoints | GAP — see F4.10 |

### 8.2 Clinical safety guardrails in the UI

| ID | Requirement | Status |
|---|---|---|
| S1 | The emergency card is visible before any tip content | SHIPPED |
| S2 | A persistent disclaimer that the app is education, not advice, and does not replace the care plan | SHIPPED — footer, `App.jsx:424-430` |
| S3 | A crisis-adjacent route (emergency number) is never more than one screen away | SHIPPED — the card, plus the PWA shortcut |

## 9. Non-functional requirements

| ID | Requirement | Target | Status |
|---|---|---|---|
| N1 | Time to interactive on a mid-range Android over 4G | < 2.5 s | Unmeasured |
| N2 | First-screen JS transfer | < 150 KB gzipped | Plausible (React 18, no router, no UI lib) — unmeasured |
| N3 | Read endpoints degrade to a usable message if the DB is unavailable | Never a 500 blank page | SHIPPED — every read returns an empty result + `note` when `_pool` is `None`; `/health` still 200 |
| N4 | `/health` always answers 200 | 100% | SHIPPED |
| N5 | API is self-describing (`response_model` on every route; `openapi.json` at repo root) | every route | SHIPPED — 8 paths published |
| N6 | No test suite / linter configured | — | **By decision.** Do not add one unprompted; see `CLAUDE.md` |
| N7 | Content edits require a migration (no self-service CMS) | — | By design. Audit trail is git; the cost is that a wording fix needs a deploy |

## 10. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Unreviewed content is read as authoritative.** No clinical sign-off, no review date (C1/C2) | High — patient harm, reputational and legal exposure | Close C1/C2/C8 before broad distribution; until then keep distribution deliberate |
| R2 | Advice ages; the app cannot show its own staleness | High over time | C2 (review interval) + a content review cadence owned by a named person |
| R3 | A user is in distress and reads the app instead of calling for help | High | Emergency card always above content, call-to-action unambiguous, never gated behind interaction |
| R4 | Favourites silently lost (cleared storage / new device) | Low–medium | P5 disclosure; optionally an export (§12) |
| R5 | Content is English-only; the audience may not be | Medium for reach, not safety | Out of scope for v1; localisation is a new workload, not a translation pass |
| R6 | Library growth hits the missing pagination | Low now, certain later | F2.11 before 200 tips |
| R7 | Unauthenticated write endpoints allow unbounded rows | Low | F4.10 rate limit |
| R8 | Adding a category silently half-works | Low — degrades gracefully | Three files must stay in sync (§6.2 F2.1); documented in `CLAUDE.md` |
| R9 | Editing `V1__init.sql` breaks deploys (`Migration checksum mismatch`) | Medium — blocks deploys until repaired | Never edit a deployed migration; schema/content changes go in a new `V2__*.sql` |

## 11. Open questions

1. **Who is the clinical owner?** No reviewer, no named role, no cadence. This blocks R1/R2
   and is the single largest gap in the product.
2. **How often is content reviewed?** 12 months is the usual default for patient education;
   needs a decision and a mechanism (C2).
3. **Who is this for, concretely?** Is distribution via a specific clinic, a cardiac rehab
   programme, or open web? That determines whether C1 is a gate or a goal, and what
   R5 (localisation) becomes.
4. **What is the evidence standard?** Which guideline bodies are acceptable as sources for
   C8 — does every tip need one, or only the warning card?
5. **Is retention measured at all?** See §13 — there is no analytics and P2 rules out the
   usual answer.

## 12. Roadmap

**Now / must close before wider distribution (P0)**
- C1, C2, C8 — clinical sign-off, review dates, sources. *Content requirements, not code.*
- P5 — disclose the per-browser favourites limitation in the UI.

**Next (P1)**
- F3.5 — search robustness (synonyms at minimum: BP/blood pressure, fibre/fiber; stemming).
- F6.8 — a real WCAG 2.2 AA audit, with fixes.
- F4.10 — rate-limit favourite writes.
- F2.11 — `offset` on `/api/tips`.
- F5.8 — offline staleness indicator.

**Later (P2)**
- F6.9 — printable emergency card / printable saved tips.
- R5 — localisation, if the audience needs it.
- Favourites export (text or print) as the mitigation for F4.8, instead of accounts.

## 13. Success metrics

The app currently has **no telemetry and, by P2, cannot have the usual kind.** Metrics must
therefore be non-invasive: aggregate counts already derivable server-side (favourites rows,
distinct `user_key`s), or qualitative.

| Metric | Source | Note |
|---|---|---|
| Distinct users saving at least one tip | `COUNT(DISTINCT user_key)` in `favourites` | Aggregate only — never per-user reporting |
| Tips saved per user | same table | Crude proxy for whether content is worth keeping |
| Installs | Not measurable without tracking | Accept as unknown, or ask |
| Find-a-tip time / task success | Moderated usability sessions with 5–8 §5.1 users | The metric that actually matters, and it needs real people |
| Content comprehension | Same sessions: can they restate one tip's *why*? | Directly tests the product thesis |

**Do not** add an analytics SDK to close this gap. The privacy posture (P2) is a feature
of a patient-health product and is worth more than the funnel data.

## 14. Acceptance criteria for v1 "done"

The app is shippable as reviewed patient education when **all** of these hold:

- [ ] C1 — every tip and the emergency card carry a named clinical approval.
- [ ] C2 — a review date is stored per item and shown in the UI.
- [ ] C8 — sources recorded for at least the warning card and every tip making a numeric claim.
- [ ] P5 — the favourites limitation is stated in the product.
- [ ] F6.8 — a WCAG 2.2 AA audit has been run and its findings closed or triaged.
- [ ] R1–R3 reviewed by the clinical owner and the risks accepted in writing.
- [ ] A named owner for the content review cadence exists.

Currently **1 of 7** is met (the app's structure and copy support all of them; none of the
content-governance ones are implemented).