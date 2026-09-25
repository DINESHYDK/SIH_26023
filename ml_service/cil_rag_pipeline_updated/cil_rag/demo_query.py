"""
Ask the pipeline a question and see every stage of what it did -- not just
the final answer. Run this after ingest_pipeline has built an index.

    python demo_query.py

Type a question, hit enter. Type 'quit' to exit.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from ingestion.ingest_pipeline import run_ingestion
from ingestion.mock_extract import mock_extract_page
from query.query_pipeline import run_query

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def ask(query: str, index, conn):
    print(f"\n>>> {query}")
    result = run_query(query, index, conn)
    print(f"    route: {result['route']}")

    if result["route"] == "structured":
        print(f"    matched table: {result['matched_table']} ({result['caption']})")
        for row in result["rows"][:5]:
            print(f"      {row}")
        return

    print("    top retrieved chunks:")
    for chunk, score in result["results"][:3]:
        print(f"      [{score:.2f}] ({chunk.chunk_type}) {chunk.text[:120]}")

    if GEMINI_API_KEY:
        from query.answer import generate_cited_answer
        out = generate_cited_answer(query, result["results"])
        print(f"\n    answer: {out['answer']}")
        if out["invalid_citations"]:
            print(f"    ⚠ invalid citations caught: {out['invalid_citations']}")
    else:
        print("\n    (no GEMINI_API_KEY set -- showing retrieval only, no generated answer)")


if __name__ == "__main__":
    print("Building index from pages 2, 3, 18 (mock extraction)...")
    index, conn = run_ingestion("data/SignedCILMoU2019-20.pdf", [2, 3, 18], mock_extract_page)
    print("Ready.\n")

    if len(sys.argv) > 1:
        # non-interactive mode: python demo_query.py "your question here"
        ask(" ".join(sys.argv[1:]), index, conn)
    else:
        while True:
            q = input("\nAsk about the CIL MoU: ")
            if q.strip().lower() in ("quit", "exit"):
                break
            ask(q, index, conn)
