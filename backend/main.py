"""Cardiac Care Tips — backend.

Substrait upload-mode contract (behavioural only):
  - listen on port 8000
  - GET /health returns 200 (the readiness probe)
  - the API lives under /api (the ingress routes /api here; everything else goes
    to the frontend)
  - read DATABASE_URL from the environment

OceanBase speaks the MySQL wire protocol: use `asyncmy` with `%s` placeholders.
It is NOT PostgreSQL — no asyncpg, no `$1`. All DDL lives in Flyway migrations
under resources/db/migration/; this file only reads and writes rows.
"""
import difflib
import os
import re
import threading
import time
from contextlib import asynccontextmanager
from datetime import date
from urllib.parse import unquote, urlparse

import asyncmy
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

APP_TITLE = os.getenv("APP_TITLE", "Cardiac Care Tips")

# How long a tip's clinical review stays current (PRD C2). Patient-education
# material is normally reviewed yearly; an installation with a faster-changing
# guideline set can lower this without a code change.
REVIEW_INTERVAL_MONTHS = max(1, int(os.getenv("REVIEW_INTERVAL_MONTHS", "12")))

# Favourite writes are unauthenticated by design (PRD F4.10 / P6). These caps make
# the endpoint bounded without introducing accounts: a per-user request budget and
# a per-user row ceiling. They are abuse limits, not access control.
WRITE_LIMIT_PER_MINUTE = max(1, int(os.getenv("WRITE_LIMIT_PER_MINUTE", "30")))
MAX_FAVOURITES_PER_USER = max(1, int(os.getenv("MAX_FAVOURITES_PER_USER", "500")))

_pool = None


def _dsn() -> dict:
    # DATABASE_URL looks like: mysql://user%40tenant:password@host:2881/dbname
    u = urlparse(os.environ["DATABASE_URL"])
    return {
        "host": u.hostname,
        "port": u.port or 2881,
        "user": unquote(u.username or ""),
        "password": unquote(u.password or ""),
        "db": (u.path or "/").lstrip("/"),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    if os.getenv("DATABASE_URL"):
        _pool = await asyncmy.create_pool(**_dsn(), autocommit=True)
    yield
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()


app = FastAPI(title=APP_TITLE, lifespan=lifespan)


# ── Models ─────────────────────────────────────────────────────────────────────
# Every endpoint declares a response model: that is what makes the app
# self-describing (FastAPI publishes these types in /openapi.json, which feeds the
# portal's API tab and the API Library).


class Health(BaseModel):
    status: str


class Tip(BaseModel):
    id: int
    category: str
    title: str
    body: str
    why: str | None = None
    sort_order: int
    # Clinical-review metadata (PRD C1/C2/C8). Null means not reviewed — the UI
    # must say so rather than implying the content is clinically approved.
    reviewed_on: date | None = None
    reviewed_by: str | None = None
    source: str | None = None


class TipList(BaseModel):
    tips: list[Tip]
    total: int
    note: str | None = None
    # True when `total` exceeds the rows returned, so a client can page.
    has_more: bool = False


class CategoryCount(BaseModel):
    category: str
    count: int


class CategoryList(BaseModel):
    categories: list[CategoryCount]


class FavouriteList(BaseModel):
    tip_ids: list[int]
    note: str | None = None


class Me(BaseModel):
    email: str | None
    user: str | None
    identified: bool


class Ok(BaseModel):
    ok: bool
    note: str | None = None


class ConfigOut(BaseModel):
    title: str


class ReviewSummary(BaseModel):
    total: int
    reviewed: int
    due_for_review: int
    all_current: bool
    interval_months: int
    note: str | None = None


# Category display metadata lives here (not in the DB) so ordering and labels can
# change without a migration.
CATEGORY_ORDER = [
    "warning",
    "nutrition",
    "activity",
    "medication",
    "monitoring",
    "lifestyle",
]


def _user_key(request: Request) -> str | None:
    """Who this request's favourites belong to.

    Under Google SSO the platform's auth proxy injects an unspoofable
    X-Forwarded-Email. With SSO off (or in local dev) the frontend supplies a
    random per-browser id in X-Client-Id.

    This is a convenience key for favourites only — NOT access control. Favourites
    are not sensitive, and anyone can send any value here; never gate real data on
    it.
    """
    email = request.headers.get("x-forwarded-email")
    if email:
        return email.strip().lower()[:255]
    client = request.headers.get("x-client-id")
    if client:
        return f"anon:{client.strip()[:120]}"
    return None


def _row_to_tip(r) -> Tip:
    return Tip(
        id=r[0],
        category=r[1],
        title=r[2],
        body=r[3],
        why=r[4],
        sort_order=r[5],
        reviewed_on=r[6],
        reviewed_by=r[7],
        source=r[8],
    )


_TIP_COLS = (
    "id, category, title, body, why, sort_order, reviewed_on, reviewed_by, source"
)


# ── Search normalisation ───────────────────────────────────────────────────────
# PRD F3.5. The audience types "fibre"/"fiber", "BP", "cholesterol" and the odd
# typo; MySQL substring matching answers none of those. We keep the LIKE query (it
# is indexed-friendly and exact) and *widen* the term before it runs: expand known
# health synonyms, and retry with close spellings when the first pass finds nothing.

# Each group is fully interchangeable: any member expands to all of them.
#
# Only unambiguous members belong in a group. Matching is substring-based, so a
# short alias like "flu" would also hit "fluid" and "mi" would hit "minutes" —
# expansions therefore have to be at least four characters (the user's own literal
# query is exempt: we always search exactly what they typed).
_SYNONYM_GROUPS = [
    {"bp", "blood pressure"},
    {"fibre", "fiber"},
    {"salt", "sodium"},
    {"sugar", "sugars", "sucrose"},
    {"fat", "fats", "lipid", "lipids"},
    {"cholesterol", "ldl", "hdl"},
    {"weight", "weigh", "weighing"},
    {"medicine", "medicines", "medication", "medications", "tablet", "tablets",
     "pill", "pills", "drug", "drugs"},
    {"exercise", "exercising", "activity", "walk", "movement"},
    {"smoke", "smoking", "cigarette", "cigarettes", "tobacco", "vaping", "quit"},
    {"breathless", "breathlessness", "breathing", "dyspnoea", "dyspnea"},
    {"stressed", "stress", "anxiety", "anxious", "worried"},
    {"low mood", "depression", "depressed", "sadness"},
    {"vaccine", "vaccines", "vaccination", "vaccinations", "jabs"},
    {"heart attack", "myocardial infarction", "heart attacks"},
    {"emergency", "ambulance", "999", "911", "112"},
]

# Expansion terms shorter than this are skipped: with `LIKE '%x%'` a 2–3 letter
# synonym generates false positives across unrelated words.
_MIN_EXPANSION_LEN = 4

# Single-token spellings we cannot get from the DB. Keys are corrected to values.
_SPELLING = {
    "excersise": "exercise",
    "exersize": "exercise",
    "excersize": "exercise",
    "colesterol": "cholesterol",
    "cholesteral": "cholesterol",
    "medecine": "medicine",
    "medicin": "medicine",
    "medication": "medication",
    "breathlesness": "breathlessness",
    "breathlessness": "breathlessness",
    "diahbetes": "diabetes",
    "diabetis": "diabetes",
    "presure": "pressure",
    "presure": "pressure",
    "wieght": "weight",
    "weigth": "weight",
    "vacetion": "vaccination",
    "vacination": "vaccination",
    "vacine": "vaccine",
    "symtoms": "symptoms",
    "symptom": "symptoms",
    "smokng": "smoking",
    "walkng": "walking",
}

# Vocabulary the fuzzy retry will consider for near-misses. Kept small on purpose:
# big enough to catch the words this library actually uses, cheap to scan in Python.
_SEARCH_VOCAB = sorted(
    {w for g in _SYNONYM_GROUPS for w in g} | set(_SPELLING.values())
    | {
        "cardiac", "heart", "chest", "pain", "shortness", "breath", "beat",
        "palpitations", "dizzy", "faint", "swelling", "ankles", "legs", "fluid",
        "sleep", "alcohol", "fish", "vegetables", "fruit", "plate", "strength",
        "organiser", "painkiller", "ibuprofen", "water", "weeks", "minutes",
        "numbers", "scale", "mood", "carer", "clinic", "doctor", "nurse",
    }
)


def _expand_term(raw: str) -> set[str]:
    """Synonyms and known misspellings for one search term.

    The literal term is always kept. Expansions drop anything shorter than
    `_MIN_EXPANSION_LEN` (except a multi-word phrase, where the phrase itself is
    specific enough).
    """
    t = raw.strip().lower()
    if not t:
        return set()
    out = {t}
    # Correct known misspellings first, then treat the corrected word as the term
    # so it picks up that word's synonyms too ("excersize" -> "exercise" -> walk,
    # activity, movement).
    corrected = _SPELLING.get(t, t)
    out.add(corrected)
    for group in _SYNONYM_GROUPS:
        if t in group or corrected in group:
            out |= group
    return {
        w for w in out
        if w == t or len(w) >= _MIN_EXPANSION_LEN or " " in w
    }


# Phrases that should be searched as one blob rather than word-by-word.
_PHRASES = sorted(
    {p for g in _SYNONYM_GROUPS for p in g if " " in p}
    | {"low mood", "heart attack", "blood pressure", "emergency services"},
    key=len,
    reverse=True,
)


def _term_groups(q: str) -> list[set[str]]:
    """Turn a query into AND-ed groups of OR-ed terms.

    Multi-word synonyms are extracted first ("blood pressure" must not be split
    into "blood" AND "pressure" — that is a different, much wider query).
    """
    text = " ".join(q.lower().split())
    groups: list[set[str]] = []

    def take(words: str) -> list[set[str]]:
        result = []
        for word in words.split():
            expanded = _expand_term(word)
            if expanded:
                result.append(expanded)
        return result

    # Greedily cut known phrases out of the query, keeping the surrounding words
    # as ordinary terms.
    for phrase in _PHRASES:
        if phrase in text:
            before, _, after = text.partition(phrase)
            groups += take(before)
            expanded = _expand_term(phrase)
            if expanded:
                groups.append(expanded)
            text = after
    groups += take(text)
    return groups


def _fuzzy_terms(raw: str) -> set[str]:
    """Close spellings from the vocabulary, for the no-results retry.

    Only consulted when the ordinary search returned nothing, so a slightly loose
    cutoff costs nothing on a good query and rescues a mistyped one. "excersize"
    scores ~0.71 against "exercise": still the obvious answer to a human.
    """
    t = raw.strip().lower()
    if len(t) < 4:
        return set()
    close = difflib.get_close_matches(t, _SEARCH_VOCAB, n=3, cutoff=0.7)
    return set(close)


class _WriteLimiter:
    """Small in-process fixed-window limiter for favourite writes.

    Per-process only: with N backend pods a client gets N× the budget, which is
    fine for an abuse cap on a non-sensitive write. A shared limiter would mean
    adding Redis, and this app deliberately declares no backing services.
    """

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, int] = {}
        self._window_start = time.monotonic()
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if now - self._window_start >= self.window:
                self._hits.clear()
                self._window_start = now
            n = self._hits.get(key, 0)
            if n >= self.limit:
                return False
            self._hits[key] = n + 1
            return True


_limiter = _WriteLimiter(WRITE_LIMIT_PER_MINUTE)


def _add_months(d: date, months: int) -> date:
    """Add whole months, clamping the day (31 Jan + 1 month -> 28/29 Feb)."""
    y, m = divmod(d.month - 1 + months, 12)
    year = d.year + y
    month = m + 1
    day = min(d.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def _review_due(tip: Tip) -> bool:
    """True when the tip has no review date or the review interval has lapsed."""
    if tip.reviewed_on is None:
        return True
    return date.today() >= _add_months(tip.reviewed_on, REVIEW_INTERVAL_MONTHS)


@app.get("/health", response_model=Health)
def health():
    return {"status": "ok"}


@app.get("/api/config", response_model=ConfigOut)
def config():
    return {"title": APP_TITLE}


@app.get("/api/me", response_model=Me)
def me(request: Request):
    email = request.headers.get("x-forwarded-email")
    return {
        "email": email,
        "user": request.headers.get("x-forwarded-user"),
        "identified": bool(email),
    }


@app.get("/api/categories", response_model=CategoryList)
async def categories():
    if _pool is None:
        return {"categories": []}
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SELECT category, COUNT(*) FROM tips GROUP BY category")
        rows = await cur.fetchall()
    counts = {r[0]: int(r[1]) for r in rows}
    ordered = [
        {"category": c, "count": counts.pop(c, 0)} for c in CATEGORY_ORDER if c in counts
    ]
    # Anything a future migration adds that isn't in CATEGORY_ORDER still shows up.
    ordered += [{"category": c, "count": n} for c, n in sorted(counts.items())]
    return {"categories": ordered}


_LIKE_COLUMNS = ("title", "body", "why", "source")


def _build_clause(category: str | None, term_groups: list[set[str]]) -> tuple[str, list]:
    """Build a WHERE clause.

    Each term group is OR-ed internally (synonyms), groups are AND-ed (every word
    the user typed must be satisfied by some column), and the category filter is
    AND-ed in front when present.
    """
    conditions, params = [], []
    if category:
        conditions.append("category = %s")
        params.append(category)
    for group in term_groups:
        term_conditions = []
        for term in sorted(group):
            ors = " OR ".join(f"{col} LIKE %s" for col in _LIKE_COLUMNS)
            term_conditions.append(f"({ors})")
            like = f"%{term}%"
            params += [like] * len(_LIKE_COLUMNS)
        conditions.append(f"({' OR '.join(term_conditions)})")
    clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return clause, params


async def _query_tips(
    category: str | None, term_groups: list[set[str]], limit: int, offset: int
):
    clause, params = _build_clause(category, term_groups)
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(f"SELECT COUNT(*) FROM tips {clause}", tuple(params))
        total = int((await cur.fetchone())[0])
        await cur.execute(
            f"SELECT {_TIP_COLS} FROM tips {clause} "
            "ORDER BY sort_order, id LIMIT %s OFFSET %s",
            tuple(params + [limit, offset]),
        )
        rows = await cur.fetchall()
    return rows, total


@app.get("/api/tips", response_model=TipList)
async def list_tips(
    category: str | None = None,
    q: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    if _pool is None:
        return {"tips": [], "total": 0, "note": "DATABASE_URL not set"}

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    groups = _term_groups(q) if q else []
    rows, total = await _query_tips(category, groups, limit, offset)

    # F3.5: a miss is usually a typo. Retry once with the closest vocabulary
    # neighbours — only when the plain, widened query found nothing.
    if q and total == 0:
        corrected = set()
        for word in re.split(r"\s+", q.strip()):
            corrected |= _fuzzy_terms(word)
        if corrected:
            rows, total = await _query_tips(category, [corrected], limit, offset)

    return {
        "tips": [_row_to_tip(r) for r in rows],
        "total": total,
        "has_more": offset + len(rows) < total,
    }


@app.get("/api/today", response_model=Tip | None)
async def today():
    """One tip per day, stable across reloads and identical for everyone.

    Warning-sign tips are excluded from the rotation: they belong in the fixed
    emergency card the UI always shows, not in a once-a-day slot. With no database
    this returns null rather than erroring — the daily tip is decoration, and a
    failed request there must not look like a broken app (PRD N3).
    """
    if _pool is None:
        return None
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT COUNT(*) FROM tips WHERE category <> %s", ("warning",)
        )
        n = int((await cur.fetchone())[0])
        if n == 0:
            raise HTTPException(status_code=404, detail="no tips available")
        offset = date.today().toordinal() % n
        await cur.execute(
            f"SELECT {_TIP_COLS} FROM tips WHERE category <> %s "
            "ORDER BY sort_order, id LIMIT 1 OFFSET %s",
            ("warning", offset),
        )
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="no tips available")
    return _row_to_tip(row)


@app.get("/api/reviews", response_model=ReviewSummary)
async def review_summary():
    """How much of the library has a current clinical review (PRD C1/C2).

    Exposed so the UI can be honest about approval status instead of implying it.
    Counts only — no reviewer identities are published here.
    """
    if _pool is None:
        return {"total": 0, "reviewed": 0, "due_for_review": 0,
                "all_current": False, "interval_months": REVIEW_INTERVAL_MONTHS,
                "note": "DATABASE_URL not set"}
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(f"SELECT {_TIP_COLS} FROM tips")
        rows = await cur.fetchall()
    tips = [_row_to_tip(r) for r in rows]
    reviewed = [t for t in tips if t.reviewed_on is not None]
    due = [t for t in tips if _review_due(t)]
    return {
        "total": len(tips),
        "reviewed": len(reviewed),
        "due_for_review": len(due),
        "all_current": bool(tips) and not due,
        "interval_months": REVIEW_INTERVAL_MONTHS,
    }


@app.get("/api/favourites", response_model=FavouriteList)
async def list_favourites(request: Request):
    key = _user_key(request)
    if key is None:
        return {"tip_ids": [], "note": "no user identity"}
    if _pool is None:
        return {"tip_ids": [], "note": "DATABASE_URL not set"}
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT tip_id FROM favourites WHERE user_key = %s ORDER BY created_at DESC",
            (key,),
        )
        rows = await cur.fetchall()
    return {"tip_ids": [int(r[0]) for r in rows]}


@app.post("/api/favourites/{tip_id}", status_code=201, response_model=Ok)
async def add_favourite(tip_id: int, request: Request):
    key = _user_key(request)
    if key is None:
        return {"ok": False, "note": "no user identity"}
    if _pool is None:
        return {"ok": False, "note": "DATABASE_URL not set"}
    # F4.10: bound the unauthenticated write path. The limiter is per-process and
    # deliberately simple; it stops a script, not a determined attacker.
    if not _limiter.allow(key):
        raise HTTPException(status_code=429, detail="too many favourite changes")
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SELECT 1 FROM tips WHERE id = %s", (tip_id,))
        if await cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="tip not found")
        # A per-user ceiling keeps unbounded-growth abuse from filling the table.
        await cur.execute(
            "SELECT COUNT(*) FROM favourites WHERE user_key = %s", (key,)
        )
        if int((await cur.fetchone())[0]) >= MAX_FAVOURITES_PER_USER:
            raise HTTPException(status_code=409, detail="favourites limit reached")
        # Idempotent: adding an existing favourite is a no-op, not an error.
        await cur.execute(
            "INSERT IGNORE INTO favourites (user_key, tip_id) VALUES (%s, %s)",
            (key, tip_id),
        )
    return {"ok": True}


@app.delete("/api/favourites/{tip_id}", response_model=Ok)
async def remove_favourite(tip_id: int, request: Request):
    key = _user_key(request)
    if key is None:
        return {"ok": False, "note": "no user identity"}
    if _pool is None:
        return {"ok": False, "note": "DATABASE_URL not set"}
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(
            "DELETE FROM favourites WHERE user_key = %s AND tip_id = %s", (key, tip_id)
        )
    return {"ok": True}