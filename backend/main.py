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
import os
from contextlib import asynccontextmanager
from datetime import date
from urllib.parse import unquote, urlparse

import asyncmy
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

APP_TITLE = os.getenv("APP_TITLE", "Cardiac Care Tips")

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


class TipList(BaseModel):
    tips: list[Tip]
    total: int
    note: str | None = None


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
    return Tip(id=r[0], category=r[1], title=r[2], body=r[3], why=r[4], sort_order=r[5])


_TIP_COLS = "id, category, title, body, why, sort_order"


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


@app.get("/api/tips", response_model=TipList)
async def list_tips(category: str | None = None, q: str | None = None, limit: int = 100):
    if _pool is None:
        return {"tips": [], "total": 0, "note": "DATABASE_URL not set"}

    limit = max(1, min(limit, 200))
    where, params = [], []
    if category:
        where.append("category = %s")
        params.append(category)
    if q:
        where.append("(title LIKE %s OR body LIKE %s OR why LIKE %s)")
        like = f"%{q}%"
        params += [like, like, like]
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute(f"SELECT COUNT(*) FROM tips {clause}", tuple(params))
        total = int((await cur.fetchone())[0])
        await cur.execute(
            f"SELECT {_TIP_COLS} FROM tips {clause} ORDER BY sort_order, id LIMIT %s",
            tuple(params + [limit]),
        )
        rows = await cur.fetchall()
    return {"tips": [_row_to_tip(r) for r in rows], "total": total}


@app.get("/api/today", response_model=Tip)
async def today():
    """One tip per day, stable across reloads and identical for everyone.

    Warning-sign tips are excluded from the rotation: they belong in the fixed
    emergency card the UI always shows, not in a once-a-day slot.
    """
    if _pool is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL not set")
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
    async with _pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SELECT 1 FROM tips WHERE id = %s", (tip_id,))
        if await cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="tip not found")
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