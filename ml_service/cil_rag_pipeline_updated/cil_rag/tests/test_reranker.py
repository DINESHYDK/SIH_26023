import sys, os, warnings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from ingestion.chunker import Chunk
from ingestion.index_builder import HybridIndex
from ingestion.sqlite_store import init_db
from query.reranker import rerank
from query.query_pipeline import run_query


def _chunk(cid, text):
    return Chunk(chunk_id=cid, chunk_type="table_row", text=text, page_number=1, section_heading=None)


class FakeCrossEncoder:
    """Scores a pair by how many query words the chunk contains -- stands in
    for the real model so tests need no weights download."""
    def __init__(self):
        self.calls = 0

    def predict(self, pairs, batch_size=16):
        self.calls += 1
        return [len(set(q.lower().split()) & set(t.lower().split())) for q, t in pairs]


def test_rerank_reorders_and_truncates():
    a = _chunk("a", "unrelated text"); b = _chunk("b", "turnover excellent target"); c = _chunk("c", "turnover only")
    out = rerank("turnover excellent target", [(a, 9.0), (c, 5.0), (b, 1.0)], top_k=2, model=FakeCrossEncoder())
    assert [ch.chunk_id for ch, _ in out] == ["b", "c"]


def test_rerank_empty_candidates():
    assert rerank("q", [], model=FakeCrossEncoder()) == []


def test_rerank_scores_all_candidates_in_one_batch_call():
    m = FakeCrossEncoder()
    rerank("q", [(_chunk(str(i), "x"), 0) for i in range(10)], top_k=3, model=m)
    assert m.calls == 1


def _index():
    chunks = [
        _chunk("n1", "capacity mines wcl project narrative filler wcl wcl"),
        _chunk("r1", "turnover excellent target 100000"),
        _chunk("r2", "turnover good target 90000"),
    ]
    idx = HybridIndex(); idx.build_bm25(chunks)
    return idx


def test_pipeline_uses_reranker_order_over_bm25_order():
    conn = init_db(":memory:")
    q = "wcl turnover excellent"
    plain = run_query(q, _index(), conn, k=2, use_reranker=False)
    assert plain["reranked"] is False
    boosted = run_query(q, _index(), conn, k=2, reranker=lambda query, cands, top_k: rerank(
        query, cands, top_k, model=FakeCrossEncoder()))
    assert boosted["reranked"] is True
    assert boosted["results"][0][0].chunk_id == "r1"  # 2 matching words beats the wcl-only chunk


def test_pipeline_falls_back_when_reranker_unavailable():
    conn = init_db(":memory:")
    def broken(*a, **k): raise OSError("cannot reach huggingface.co")
    with pytest.warns(UserWarning, match="reranker failed"):
        out = run_query("turnover", _index(), conn, k=2, reranker=broken)
    assert out["reranked"] is False and len(out["results"]) == 2
