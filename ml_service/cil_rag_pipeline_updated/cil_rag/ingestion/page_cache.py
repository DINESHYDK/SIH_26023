"""
Caches each page's extraction result to disk immediately after it succeeds.
This is the fix for losing pages 1-17's real Gemini output when page 18 hit
a daily quota limit -- nothing was persisted until run_ingestion finished
entirely, so a crash partway through threw away every successful call that
came before it. Now each page is saved the moment it's extracted, so
reruns skip pages that are already cached and only call Gemini for the ones
still missing.
"""
import os
import json
from dataclasses import asdict

from ingestion.vision_extract import ExtractedPage, ExtractedTable

CACHE_DIR = "data/extracted_pages"


def _cache_path(page_number: int, cache_dir: str = CACHE_DIR) -> str:
    return f"{cache_dir}/page_{page_number}.json"


def is_cached(page_number: int, cache_dir: str = CACHE_DIR) -> bool:
    return os.path.exists(_cache_path(page_number, cache_dir))


def save(page: ExtractedPage, cache_dir: str = CACHE_DIR) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    with open(_cache_path(page.page_number, cache_dir), "w") as f:
        json.dump(asdict(page), f, indent=2)


def load(page_number: int, cache_dir: str = CACHE_DIR) -> ExtractedPage:
    with open(_cache_path(page_number, cache_dir)) as f:
        data = json.load(f)
    tables = [ExtractedTable(**t) for t in data.get("tables", [])]
    return ExtractedPage(
        page_number=data["page_number"],
        section_heading=data.get("section_heading"),
        narrative_text=data.get("narrative_text", ""),
        tables=tables,
        signatories=data.get("signatories", []),
    )


def cached_extract(extract_fn, image_path: str, page_number: int, cache_dir: str = CACHE_DIR) -> ExtractedPage:
    """Drop-in wrapper around extract_page (or mock_extract_page): checks the
    cache first, only calls the real (costly, quota-limited) function on a
    cache miss, and saves the result immediately -- not at the end of the
    whole run."""
    if is_cached(page_number, cache_dir):
        return load(page_number, cache_dir)
    page = extract_fn(image_path, page_number)
    save(page, cache_dir)
    return page
