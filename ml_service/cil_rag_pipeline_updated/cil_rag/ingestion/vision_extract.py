"""
Vision-based page extraction for scanned documents.

Why this exists: the reference document (SignedCILMoU2019-20.pdf) is a scanned
PDF -- every page is one raster JPEG with a broken embedded OCR text layer.
Classical extraction has nothing usable to work with, so page images go
straight to Gemini, which returns heading, narrative text and tables as JSON.

Quota-friendly design (this is what fixes the 429 / RESOURCE_EXHAUSTED errors):
  1. BATCHING -- several pages go in ONE request (EXTRACT_BATCH_SIZE, default
     4). 21 pages = 6 requests instead of 21. RPM and RPD limits both count
     requests, so this is the biggest lever.
  2. COMPACT OUTPUT -- tables come back as `columns` once + `rows` as arrays,
     not one dict per row repeating every column name. ~2-3x fewer output
     tokens on table-heavy pages. Rows are expanded back into dicts here, so
     the chunker / SQLite store see the same ExtractedTable shape as before.
  3. NO THINKING TOKENS -- for gemini-2.5-flash, thinking is switched off
     (pure transcription doesn't benefit from it, and thinking tokens eat the
     output budget and slow every call).
  4. SHARED CLIENT-SIDE LIMITER -- OCR and answer calls share GEMINI_RPM and
     GEMINI_RPD limits, so concurrent uploads cannot exceed either quota.
  5. SMART RETRIES -- on 429 we wait the server's own `retryDelay` (the old
     2/4/8/16s backoff was shorter than the 60s per-minute window, so it
     burned all retries). A *daily* quota error is not retried at all: it
     raises DailyQuotaExceeded, and because every finished page is cached
     immediately, rerunning later resumes where it stopped.
  6. BISECT ON FAILURE -- if a batch is truncated (MAX_TOKENS) or comes back
     unparseable, it's split in half and retried, down to single pages.

Env knobs: GEMINI_API_KEY, GEMINI_MODEL, GEMINI_RPM, EXTRACT_BATCH_SIZE,
GEMINI_THINKING=on (to leave thinking enabled).
"""
import json
import os
import random
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Optional

from dotenv import load_dotenv
from agents.gemini_rate_limiter import gemini_rate_limiter

load_dotenv()

GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
BATCH_SIZE = int(os.getenv("EXTRACT_BATCH_SIZE", "4"))
MAX_RETRIES = 6
MAX_BACKOFF_S = 90.0
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


def _generate_json(parts: list) -> tuple:
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
    if GEMINI_MODEL_NAME.startswith("gemini-2.5-flash") and os.getenv("GEMINI_THINKING", "off") != "on":
        cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

    resp = _get_client().models.generate_content(
        model=GEMINI_MODEL_NAME,
        contents=contents,
        config=types.GenerateContentConfig(**cfg),
    )
    finish = str(resp.candidates[0].finish_reason) if resp.candidates else "NO_CANDIDATES"
    return (resp.text or ""), finish


def _classify_error(exc: Exception) -> tuple:
    """-> (kind, server_suggested_wait_seconds). kind: 'daily' | 'retry' | 'fatal'."""
    code = getattr(exc, "code", None)
    if code not in (429, 500, 503):
        return "fatal", None
    text = str(exc)
    if code == 429 and re.search(r"PerDay|per day|requests per day", text, re.I):
        return "daily", None
    m = (re.search(r"retry\s+in\s+(\d+(?:\.\d+)?)\s*s", text, re.I)
         or re.search(r"retryDelay\W+(\d+(?:\.\d+)?)s", text))
    return "retry", (float(m.group(1)) if m else None)


def _generate_with_retry(parts: list) -> tuple:
    for attempt in range(MAX_RETRIES):
        # All OCR and answer-generation calls use this same guard, so parallel
        # uploads cannot collectively overrun the Gemini RPM/RPD allowance.
        gemini_rate_limiter.acquire()
        try:
            return _generate_json(parts)
        except Exception as exc:  # classified below; anything unknown is re-raised
            kind, server_wait = _classify_error(exc)
            if kind == "fatal":
                raise
            if kind == "daily":
                raise DailyQuotaExceeded(
                    "Gemini daily request quota exhausted. Finished pages are cached; "
                    "rerun after the quota resets (or enable billing / switch model)."
                ) from exc
            if attempt == MAX_RETRIES - 1:
                raise
            backoff = min(MAX_BACKOFF_S, 5.0 * (2 ** attempt))
            wait = min(MAX_BACKOFF_S, max(server_wait or 0.0, backoff)) + random.uniform(0, 1)
            print(f"  gemini {exc.code}, waiting {wait:.0f}s (attempt {attempt + 1}/{MAX_RETRIES})...")
            time.sleep(wait)


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

def _extract_batch(page_paths: dict) -> dict:
    """ONE API request for all pages in page_paths ({page_number: image_path}).
    Returns {page_number: ExtractedPage} for the pages the model returned."""
    nums = list(page_paths)
    prompt = (BATCH_PROMPT.replace("<N>", str(len(nums)))
                          .replace("<PAGE_LIST>", ", ".join(map(str, nums))))
    parts = [("text", prompt)]
    for pn in nums:
        with open(page_paths[pn], "rb") as f:
            parts += [("text", f"PAGE {pn}:"), ("image", f.read(), "image/png")]

    raw, finish = _generate_with_retry(parts)
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

    return {pn: _build_page(d, pn) for pn, d in by_num.items()}


def extract_pages(page_paths: dict, batch_size: int = None,
                  on_page: Callable = None) -> dict:
    """Extract many pages with as few requests as possible.

    page_paths: {page_number: image_path}. on_page(ExtractedPage) is called the
    moment each page succeeds (pass page_cache.save so a crash loses nothing).
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
        try:
            got = _extract_batch({pn: page_paths[pn] for pn in batch})
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
