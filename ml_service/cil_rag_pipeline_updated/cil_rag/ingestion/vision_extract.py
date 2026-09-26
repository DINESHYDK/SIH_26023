"""
Vision-based page extraction for scanned documents.

Why this exists: the reference document (SignedCILMoU2019-20.pdf) is a scanned
PDF -- every page is one raster JPEG with a broken embedded OCR text layer.
Classical extraction has nothing usable to work with, so page images go
straight to Gemini, which returns heading, narrative text and tables as JSON.

Quota-friendly design (this is what fixes the 429 / RESOURCE_EXHAUSTED errors):
  1. BATCHING -- several pages go in ONE request (EXTRACT_BATCH_SIZE, default
     8). 21 pages = 3 requests instead of 21. RPM and RPD limits both count
     requests, so this is the biggest lever. Each finished batch is also
     handed to on_batch (with the exact image bytes that were sent) so the
     caller can persist a per-batch JSON record.
  2. COMPACT OUTPUT -- tables come back as `columns` once + `rows` as arrays,
     not one dict per row repeating every column name. ~2-3x fewer output
     tokens on table-heavy pages. Rows are expanded back into dicts here, so
     the chunker / SQLite store see the same ExtractedTable shape as before.
  3. NO THINKING TOKENS -- for gemini-2.5-flash, thinking is switched off
     (pure transcription doesn't benefit from it, and thinking tokens eat the
     output budget and slow every call).
  4. SHARED CLIENT-SIDE LIMITER -- OCR and answer calls share GEMINI_RPM and
     GEMINI_RPD limits, so concurrent uploads cannot exceed either quota.
  5. SHARED EXPONENTIAL BACKOFF -- transient failures (429 per-minute, 5xx,
     timeouts) back off per model with full-jitter exponential delays
     (GEMINI_BASE_BACKOFF_S doubling up to GEMINI_MAX_BACKOFF_S, never below
     the server's own `retryDelay`) for up to GEMINI_RETRY_BUDGET_S per
     batch. The backoff state is process-wide, so concurrent uploads back off
     together instead of hammering an overloaded model. A *daily* quota error
     retires that model; DailyQuotaExceeded is raised only when every model
     is retired. Every finished page is cached immediately, so rerunning
     later resumes where it stopped.
  6. BISECT ON FAILURE -- if a batch is truncated (MAX_TOKENS) or comes back
     unparseable, it's split in half and retried, down to single pages.
  7. MODEL FALLBACK -- while the preferred model is backing off, the batch
     goes to the next model in GEMINI_FALLBACK_MODELS that is ready, and
     returns to the preferred one once its backoff ends.

Env knobs: GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODELS (comma list,
default gemini-2.5-flash), GEMINI_RPM, EXTRACT_BATCH_SIZE,
GEMINI_RETRY_BUDGET_S, GEMINI_BASE_BACKOFF_S, GEMINI_MAX_BACKOFF_S,
GEMINI_THINKING=on (to leave thinking enabled).
"""
import json
import os
import random
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

from dotenv import load_dotenv
from agents.gemini_rate_limiter import gemini_rate_limiter

load_dotenv()

GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Primary first, then fallbacks, de-duplicated in order.
GEMINI_MODELS = list(dict.fromkeys(
    [GEMINI_MODEL_NAME] + [m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash").split(",") if m.strip()]
))
BATCH_SIZE = int(os.getenv("EXTRACT_BATCH_SIZE", "8"))
# Total time one batch may spend retrying transient errors before giving up.
# Keep it below the backend's ML_UPLOAD_TIMEOUT_MS for a single batch.
RETRY_BUDGET_S = float(os.getenv("GEMINI_RETRY_BUDGET_S", "300"))
BASE_BACKOFF_S = float(os.getenv("GEMINI_BASE_BACKOFF_S", "2"))
MAX_BACKOFF_S = float(os.getenv("GEMINI_MAX_BACKOFF_S", "60"))
MAX_OUTPUT_TOKENS = 32768

BATCH_PROMPT = """You are extracting structured content from <N> consecutive pages
of a scanned government document (a Coal India Limited / Ministry of Coal MoU).
Each image is preceded by a label "PAGE <number>:". Pages requested: <PAGE_LIST>.
Read the visual content directly; ignore any invisible OCR text layer, which is
badly corrupted.

Return ONLY valid JSON (no markdown fences, no preamble), exactly this shape:

{
  "pages": [
    {
      "page_number": <int, from the label>,
      "section_heading": <string or null - heading/annex title on this page>,
      "narrative_text": <string - prose on the page, correctly spelled; "" if none>,
      "tables": [
        {
          "table_id": <short snake_case id, e.g. "annex_ii_part_a">,
          "caption": <string or null - the table's own title>,
          "columns": [<column names, flattened if multi-row headers>],
          "rows": [ [<cell for column 1>, <cell for column 2>, ...], ... ],
          "notes": <string or null - footnotes under the table>
        }
      ],
      "signatories": [<string, only if the page has signature blocks>]
    }
  ]
}

Rules:
- One entry in "pages" per requested page, in order, even if a page is blank.
- Each row is an ARRAY of strings with exactly one cell per entry in "columns",
  in the same order. Use "" for an empty cell. Do NOT repeat column names in rows.
- If a table continues from the previous page, reuse the same table_id, caption
  and columns so the pieces can be joined.
- Preserve numbers exactly as shown. Do not round or reformat.
- Merged header cells (e.g. "MoU Target" over Excellent/V.G./Good/Fair/Poor)
  become separate columns, e.g. "MoU Target - Excellent".
- Fix obvious scan misreads from context (e.g. "Conl lrqon Lrrvutep" is
  "Coal India Limited").
- If a page has no tables, return an empty list for "tables".
"""


@dataclass
class ExtractedTable:
    table_id: str
    caption: Optional[str]
    columns: list
    rows: list
    notes: Optional[str] = None


@dataclass
class ExtractedPage:
    page_number: int
    section_heading: Optional[str]
    narrative_text: str
    tables: list = field(default_factory=list)  # list[ExtractedTable]
    signatories: list = field(default_factory=list)


class DailyQuotaExceeded(RuntimeError):
    """Per-day quota is gone; retrying now is pointless. Cached pages are safe."""


class BatchOutputError(ValueError):
    """Model output was truncated, unparseable, or missing pages."""


class ModelsUnavailable(RuntimeError):
    """Every configured model stayed overloaded (503). Cached pages are safe."""


# ---------------------------------------------------------------- transport

_client = None


def _get_client():
    global _client
    if _client is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY not set. See mock_extract_page() for an offline stand-in."
            )
        from google import genai  # lazy: importing this module needs no SDK
        _client = genai.Client(api_key=key)
    return _client


def _generate_json(parts: list, model: str = GEMINI_MODEL_NAME) -> tuple:
    """One raw Gemini call. parts = [("text", str) | ("image", bytes, mime)].
    Returns (response_text, finish_reason_str). This is the only function that
    touches the network, so it's the seam tests replace."""
    from google.genai import types

    contents = [
        types.Part.from_text(text=p[1]) if p[0] == "text"
        else types.Part.from_bytes(data=p[1], mime_type=p[2])
        for p in parts
    ]
    cfg = dict(
        temperature=0.1,
        response_mime_type="application/json",
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    if model.startswith("gemini-2.5-flash") and os.getenv("GEMINI_THINKING", "off") != "on":
        cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

    resp = _get_client().models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(**cfg),
    )
    finish = str(resp.candidates[0].finish_reason) if resp.candidates else "NO_CANDIDATES"
    return (resp.text or ""), finish


# Transient server-side failures worth retrying. 429 is split further below
# (per-minute vs per-day); anything else with an HTTP code is a real error.
_RETRYABLE_CODES = {408, 429, 500, 502, 503, 504}
_OVERLOAD_CODES = {500, 502, 503, 504}


def _is_network_error(exc: Exception) -> bool:
    """Timeouts / dropped connections from the SDK's HTTP layer (httpx)."""
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    try:
        import httpx
        return isinstance(exc, httpx.TransportError)
    except ImportError:
        return False


def _classify_error(exc: Exception) -> tuple:
    """-> (kind, server_suggested_wait_seconds).
    kind: 'daily' | 'rate' (429/minute) | 'overload' (5xx/network) | 'fatal'."""
    code = getattr(exc, "code", None)
    if code is None and _is_network_error(exc):
        return "overload", None
    if code not in _RETRYABLE_CODES:
        return "fatal", None
    text = str(exc)
    if code == 429 and re.search(r"PerDay|per day|requests per day", text, re.I):
        return "daily", None
    m = (re.search(r"retry\s+in\s+(\d+(?:\.\d+)?)\s*s", text, re.I)
         or re.search(r"retryDelay\W+(\d+(?:\.\d+)?)s", text))
    return ("rate" if code in (408, 429) else "overload"), (float(m.group(1)) if m else None)


class _ModelHealth:
    """Process-wide, thread-safe backoff state per model.

    Shared by every concurrent upload/batch, so when a model starts failing
    they all back off from it together instead of each hammering it until
    their own retries run out. Consecutive failures grow the backoff
    exponentially (full jitter, so callers don't retry in lockstep); one
    success resets it.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._until: dict = {}      # model -> monotonic time it may be called again
        self._failures: dict = {}   # model -> consecutive failures
        self._exhausted: set = set()  # models whose daily quota is gone

    def reset(self):
        with self._lock:
            self._until.clear(); self._failures.clear(); self._exhausted.clear()

    def pick(self, models: list) -> tuple:
        """-> (model, seconds until it may be called). Prefers the earliest
        listed model that is ready now; otherwise the one ready soonest.
        (None, 0) when every model's daily quota is exhausted."""
        now = time.monotonic()
        with self._lock:
            usable = [m for m in models if m not in self._exhausted]
            if not usable:
                return None, 0.0
            waits = [(max(0.0, self._until.get(m, 0.0) - now), i, m) for i, m in enumerate(usable)]
        ready = [w for w in waits if w[0] == 0.0]
        wait, _, model = min(ready or waits)
        return model, wait

    def failed(self, model: str, server_wait) -> float:
        """Record a transient failure; return the backoff applied to the model."""
        with self._lock:
            failures = self._failures.get(model, 0) + 1
            self._failures[model] = failures
            ceiling = min(MAX_BACKOFF_S, BASE_BACKOFF_S * (2 ** (failures - 1)))
            # Full jitter, but never shorter than what the server asked for.
            delay = max(server_wait or 0.0, random.uniform(BASE_BACKOFF_S, max(BASE_BACKOFF_S, ceiling)))
            self._until[model] = max(self._until.get(model, 0.0), time.monotonic() + delay)
            return delay

    def succeeded(self, model: str):
        with self._lock:
            self._failures.pop(model, None)

    def exhausted(self, model: str):
        with self._lock:
            self._exhausted.add(model)


_model_health = _ModelHealth()


def _generate_with_retry(parts: list) -> tuple:
    """-> (response_text, finish_reason, model_used).

    Retries transient failures (429 per-minute, 5xx, timeouts) with shared
    exponential backoff until RETRY_BUDGET_S is spent, moving to fallback
    models while the preferred one cools down. A per-day 429 retires that
    model; only when every model is retired is DailyQuotaExceeded raised.
    """
    deadline = time.monotonic() + RETRY_BUDGET_S
    last_exc, attempts = None, 0
    while True:
        model, wait = _model_health.pick(GEMINI_MODELS)
        if model is None:
            raise DailyQuotaExceeded(
                "Gemini daily request quota exhausted for every configured model. Finished pages are cached; "
                "rerun after the quota resets (or enable billing / add GEMINI_FALLBACK_MODELS)."
            ) from last_exc
        if wait > 0:
            if time.monotonic() + wait > deadline:
                raise ModelsUnavailable(
                    f"Gemini stayed unavailable for {RETRY_BUDGET_S:.0f}s across {attempts} attempt(s) "
                    f"({', '.join(GEMINI_MODELS)}); last error: {last_exc}. "
                    "Pages extracted so far are cached; retry the upload later to resume."
                ) from last_exc
            time.sleep(wait)
        # All OCR and answer-generation calls use this same guard, so parallel
        # uploads cannot collectively overrun the Gemini RPM/RPD allowance.
        gemini_rate_limiter.acquire()
        attempts += 1
        try:
            result = _generate_json(parts, model=model)
            _model_health.succeeded(model)
            return (*result, model)
        except Exception as exc:  # classified below; anything unknown is re-raised
            kind, server_wait = _classify_error(exc)
            if kind == "fatal":
                raise
            last_exc = exc
            if kind == "daily":
                print(f"  {model}: daily quota exhausted; retiring it for this process")
                _model_health.exhausted(model)
                continue
            delay = _model_health.failed(model, server_wait)
            print(f"  gemini {getattr(exc, 'code', type(exc).__name__)} on {model} "
                  f"(attempt {attempts}); backing off {model} for {delay:.0f}s")


# ------------------------------------------------------------------ parsing

def _parse_json_response(raw_text: str):
    """Tolerate ```json fences even though JSON mode shouldn't produce them."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())


def _cell(v) -> str:
    return "" if v is None else str(v)


def _dedupe_columns(columns: list) -> list:
    seen, out = {}, []
    for c in columns:
        c = _cell(c)
        seen[c] = seen.get(c, 0) + 1
        out.append(c if seen[c] == 1 else f"{c} ({seen[c]})")
    return out


def _rows_to_dicts(columns: list, rows: list) -> list:
    """Expand compact array rows into {column: value} dicts. Short rows are
    padded, overlong rows keep their extra cells as extra_N -- no data dropped."""
    out = []
    for r in rows:
        if isinstance(r, dict):  # model ignored the compact format; still fine
            out.append({_cell(k): _cell(v) for k, v in r.items()})
            continue
        cells = [_cell(v) for v in r]
        row = {col: (cells[i] if i < len(cells) else "") for i, col in enumerate(columns)}
        for j, extra in enumerate(cells[len(columns):], start=1):
            row[f"extra_{j}"] = extra
        out.append(row)
    return out


def _build_page(data: dict, page_number: int) -> ExtractedPage:
    tables, used_ids = [], set()
    for i, t in enumerate(data.get("tables") or []):
        columns = _dedupe_columns(t.get("columns") or [])
        tid = t.get("table_id") or f"p{page_number}_t{i}"
        if tid in used_ids:
            tid = f"{tid}_{i}"
        used_ids.add(tid)
        tables.append(ExtractedTable(
            table_id=tid,
            caption=t.get("caption"),
            columns=columns,
            rows=_rows_to_dicts(columns, t.get("rows") or []),
            notes=t.get("notes"),
        ))
    return ExtractedPage(
        page_number=page_number,
        section_heading=data.get("section_heading"),
        narrative_text=data.get("narrative_text") or "",
        tables=tables,
        signatories=data.get("signatories") or [],
    )


# ---------------------------------------------------------------- extraction

@dataclass
class BatchResult:
    """One API call's output plus exactly what was sent, for on_batch."""
    page_numbers: list
    pages: dict           # {page_number: ExtractedPage}
    images: dict          # {page_number: (png bytes, mime type)} as sent
    model: str


def _extract_batch(page_paths: dict, _result: list = None) -> dict:
    """ONE API request for all pages in page_paths ({page_number: image_path}).
    Returns {page_number: ExtractedPage} for the pages the model returned.
    If _result is a list, a BatchResult is appended to it."""
    nums = list(page_paths)
    prompt = (BATCH_PROMPT.replace("<N>", str(len(nums)))
                          .replace("<PAGE_LIST>", ", ".join(map(str, nums))))
    parts = [("text", prompt)]
    images = {}
    for pn in nums:
        with open(page_paths[pn], "rb") as f:
            images[pn] = (f.read(), "image/png")
        parts += [("text", f"PAGE {pn}:"), ("image", *images[pn])]

    raw, finish, model = _generate_with_retry(parts)
    if "MAX_TOKENS" in finish:
        raise BatchOutputError(f"output truncated for pages {nums}")
    try:
        data = _parse_json_response(raw)
    except json.JSONDecodeError as e:
        raise BatchOutputError(f"unparseable JSON for pages {nums}: {e}") from e

    items = data.get("pages") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise BatchOutputError(f"no 'pages' list for pages {nums}")

    by_num = {}
    for d in items:
        try:
            pn = int(d.get("page_number"))
        except (TypeError, ValueError, AttributeError):
            continue
        if pn in page_paths and pn not in by_num:
            by_num[pn] = d
    if len(by_num) != len(items) and len(items) == len(nums):
        by_num = dict(zip(nums, items))  # model mislabeled page numbers; trust order

    pages = {pn: _build_page(d, pn) for pn, d in by_num.items()}
    if _result is not None:
        _result.append(BatchResult(nums, pages, images, model))
    return pages


def extract_pages(page_paths: dict, batch_size: int = None,
                  on_page: Callable = None, on_batch: Callable = None) -> dict:
    """Extract many pages with as few requests as possible.

    page_paths: {page_number: image_path}. on_page(ExtractedPage) is called the
    moment each page succeeds (pass page_cache.save so a crash loses nothing).
    on_batch(BatchResult) is called once per successful API call.
    Returns {page_number: ExtractedPage}.
    """
    batch_size = batch_size or BATCH_SIZE
    nums = sorted(page_paths)
    queue = deque(nums[i:i + batch_size] for i in range(0, len(nums), batch_size))
    results = {}
    calls = 0

    while queue:
        batch = queue.popleft()
        calls += 1
        print(f"  request {calls}: pages {batch[0]}-{batch[-1]} ({len(batch)} page(s))")
        sent = []
        try:
            got = _extract_batch({pn: page_paths[pn] for pn in batch}, _result=sent)
        except BatchOutputError as e:
            if len(batch) == 1:
                raise
            print(f"  {e}; splitting batch")
            mid = len(batch) // 2
            queue.appendleft(batch[mid:])
            queue.appendleft(batch[:mid])
            continue

        for pn, page in got.items():
            results[pn] = page
            if on_page:
                on_page(page)
        if on_batch and sent and got:
            on_batch(sent[0])
        missing = [pn for pn in batch if pn not in got]
        if missing:
            if len(missing) == len(batch):
                if len(batch) == 1:
                    raise BatchOutputError(f"page {batch[0]} missing from model output")
                mid = len(batch) // 2
                queue.appendleft(batch[mid:])
                queue.appendleft(batch[:mid])
            else:
                queue.appendleft(missing)

    print(f"  done: {len(results)} pages in {calls} request(s)")
    return results


def extract_page(image_path: str, page_number: int) -> ExtractedPage:
    """Single-page call, kept for compatibility with the per-page pipeline."""
    got = _extract_batch({page_number: image_path})
    if page_number not in got:
        raise BatchOutputError(f"page {page_number} missing from model output")
    return got[page_number]
