"""
End-to-end ingestion: PDF -> rasterized pages -> Gemini vision extraction ->
chunks -> BM25 + structured indexes.

Usage with a real Gemini key:
    from ingestion.vision_extract import extract_page
    run_ingestion("SignedCILMoU2019-20.pdf", page_numbers=[2, 3, 18], extract_fn=extract_page)

Usage in this sandbox (no live API access):
    from ingestion.mock_extract import mock_extract_page
    run_ingestion("SignedCILMoU2019-20.pdf", page_numbers=[2, 3, 18], extract_fn=mock_extract_page)
"""
import os
import fitz

from ingestion.chunker import chunk_page
from ingestion.sqlite_store import init_db, store_table
from ingestion.index_builder import HybridIndex
from ingestion.page_cache import cached_extract, is_cached, save as save_page

PAGE_IMAGE_DIR = "data/page_images"


def rasterize_pages(pdf_path: str, page_numbers: list, dpi: int = 150,
                    image_dir: str = PAGE_IMAGE_DIR) -> dict:
    """1-indexed page_numbers -> saved image paths. Only rasterizes pages
    that don't already have a saved image, so re-running ingestion doesn't
    re-render everything."""
    os.makedirs(image_dir, exist_ok=True)
    paths = {}
    # Close the PDF immediately after rendering: long scanned reports can
    # otherwise leave an open Windows file handle after an upload finishes.
    with fitz.open(pdf_path) as doc:
        for pn in page_numbers:
            out_path = os.path.join(image_dir, f"page_{pn}.png")
            if not os.path.exists(out_path):
                pix = doc[pn - 1].get_pixmap(dpi=dpi)
                pix.save(out_path)
            paths[pn] = out_path
    return paths


def _no_single_page_fallback(image_path: str, page_number: int):
    raise RuntimeError(f"page {page_number} was not produced by batch extraction")


def run_ingestion(pdf_path: str, page_numbers: list, extract_fn=None,
                  db_path: str = "data/structured_store.db", batch_extract_fn=None,
                  image_dir: str = PAGE_IMAGE_DIR, cache_dir: str = None):
    """extract_fn(image_path, page_number) is the per-page path (mock or real).
    batch_extract_fn(page_paths, on_page=...) is the quota-friendly path
    (vision_extract.extract_pages): all uncached pages go out in a few batched
    requests, and each finished page is cached immediately via on_page."""
    # The API passes document-specific directories here. Keeping images,
    # cached OCR and SQLite rows together prevents cross-document retrieval.
    cache_dir = cache_dir or "data/extracted_pages"
    image_paths = rasterize_pages(pdf_path, page_numbers, image_dir=image_dir)
    conn = init_db(db_path)

    if batch_extract_fn is not None:
        missing = {pn: image_paths[pn] for pn in page_numbers
                   if not is_cached(pn, cache_dir=cache_dir)}
        if missing:
            print(f"batch-extracting {len(missing)} uncached page(s)...")
            batch_extract_fn(missing, on_page=lambda page: save_page(page, cache_dir=cache_dir))
        extract_fn = extract_fn or _no_single_page_fallback

    all_chunks = []
    for pn in page_numbers:
        if is_cached(pn, cache_dir=cache_dir):
            print(f"page {pn}: using cached extraction (no API call)")
        else:
            print(f"extracting page {pn}...")
        page = cached_extract(extract_fn, image_paths[pn], pn, cache_dir=cache_dir)

        for table in page.tables:
            store_table(conn, page.page_number, page.section_heading, table)

        page_chunks = chunk_page(page)
        all_chunks.extend(page_chunks)
        print(f"  -> {len(page_chunks)} chunks ({sum(1 for c in page_chunks if c.chunk_type=='table_row')} table rows, "
              f"{sum(1 for c in page_chunks if c.chunk_type=='narrative')} narrative)")

    index = HybridIndex()
    index.build_bm25(all_chunks)
    print(f"\nBM25 index built over {len(all_chunks)} chunks total.")
    return index, conn
