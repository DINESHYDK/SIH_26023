import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from query.rrf import reciprocal_rank_fusion
from ingestion.chunker import Chunk


def _chunk(cid):
    return Chunk(chunk_id=cid, chunk_type="narrative", text=f"text {cid}", page_number=1, section_heading=None)


def test_item_ranked_first_in_both_lists_wins():
    a = _chunk("a"); b = _chunk("b")
    bm25 = [(a, 5.0), (b, 3.0)]
    vector = [(a, 0.9), (b, 0.5)]
    fused = reciprocal_rank_fusion(bm25, vector)
    assert fused[0][0].chunk_id == "a"


def test_item_only_in_one_list_still_included():
    a = _chunk("a"); b = _chunk("b"); c = _chunk("c")
    bm25 = [(a, 5.0), (b, 3.0)]
    vector = [(c, 0.9)]
    fused = reciprocal_rank_fusion(bm25, vector)
    ids = {chunk.chunk_id for chunk, _ in fused}
    assert ids == {"a", "b", "c"}


def test_agreement_across_both_lists_beats_single_list_top_rank():
    """The actual point of RRF: an item ranked #2 in BOTH lists should beat
    an item ranked #1 in only one list and absent from the other.

    NOTE: an earlier version of this test used a symmetric setup (a: rank0/
    absent-then-rank1, b: rank1/rank0) which is a genuine tie under RRF, not
    an agreement-beats-single-list case -- that was a bug in the test, not
    the code. Fixed by making 'a' genuinely absent from one list."""
    a = _chunk("a"); b = _chunk("b")
    bm25 = [(a, 10.0), (b, 8.0)]   # a is #1, b is #2
    vector = [(b, 0.95)]            # a doesn't appear at all
    fused = reciprocal_rank_fusion(bm25, vector)
    assert fused[0][0].chunk_id == "b"  # b: rank1+rank0 beats a: rank0-only
