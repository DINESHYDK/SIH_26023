"""
Run this once you have a real GEMINI_API_KEY set (see .env.example).
Ingests all 21 pages using the REAL vision_extract.extract_page() -- no mock.

    python run_full_ingest.py

Pages are sent in batches (EXTRACT_BATCH_SIZE, default 4), so 21 pages is ~6
requests, throttled to GEMINI_RPM. Finished pages are cached immediately, so
if a quota error stops the run, just rerun and it resumes.

Saves the index and structured store to data/ so demo_query.py can load them
without re-running extraction every time.
"""
import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()

if not os.getenv("GEMINI_API_KEY"):
    print("ERROR: GEMINI_API_KEY not set. Copy .env.example to .env and add your key.")
    sys.exit(1)

from ingestion.ingest_pipeline import run_ingestion
from ingestion.vision_extract import extract_pages, DailyQuotaExceeded  # REAL Gemini, batched

if __name__ == "__main__":
    pages = list(range(1, 22))  # all 21 pages
    print(f"Running batched Gemini vision extraction on {len(pages)} pages...")
    try:
        index, conn = run_ingestion(
            "data/SignedCILMoU2019-20.pdf",
            page_numbers=pages,
            batch_extract_fn=extract_pages,
        )
    except DailyQuotaExceeded as e:
        print(f"\nSTOPPED: {e}")
        sys.exit(2)

    index.save("data/index.pkl")
    print(f"\nDone. Indexed {len(index.chunks)} chunks from {len(pages)} pages.")
    print("Now run: python demo_query.py \"your question\"")
