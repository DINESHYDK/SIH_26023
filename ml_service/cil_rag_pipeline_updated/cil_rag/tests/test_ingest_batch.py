import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from ingestion.ingest_pipeline import run_ingestion
from ingestion.mock_extract import mock_extract_page

PDF = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "SignedCILMoU2019-20.pdf"))


@pytest.mark.skipif(not os.path.exists(PDF), reason="sample PDF not present")
def test_batch_path_only_extracts_uncached_pages_and_reingest_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    os.makedirs("data")
    seen = []

    def fake_batch(page_paths, on_page=None):
        seen.append(sorted(page_paths))
        for pn, path in page_paths.items():
            page = mock_extract_page(path, pn)
            on_page(page)

    idx1, conn = run_ingestion(PDF, [2, 3, 18], batch_extract_fn=fake_batch, db_path="data/s.db")
    rows_first = conn.execute("SELECT COUNT(*) FROM table_rows").fetchone()[0]
    idx2, conn2 = run_ingestion(PDF, [2, 3, 18], batch_extract_fn=fake_batch, db_path="data/s.db")
    rows_second = conn2.execute("SELECT COUNT(*) FROM table_rows").fetchone()[0]

    assert seen == [[2, 3, 18]]            # 2nd run: everything cached -> no batch call at all
    assert rows_first == rows_second > 0   # rerun doesn't duplicate structured rows
    assert len(idx1.chunks) == len(idx2.chunks)
