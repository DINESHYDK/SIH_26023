"""Reciprocal Rank Fusion: merges two ranked lists by rank position, not raw
score -- sidesteps normalizing BM25 scores (unbounded, corpus-dependent)
against cosine similarities (bounded 0-1), which don't sit on the same scale."""

K = 60  # standard RRF constant; dampens the impact of any single rank


def reciprocal_rank_fusion(*ranked_lists, k: int = K) -> list:
    """Each ranked_lists arg is [(chunk, score), ...] sorted best-first.
    Returns [(chunk, fused_score), ...] sorted best-first, deduped by chunk_id."""
    scores = {}
    chunk_by_id = {}
    for ranked_list in ranked_lists:
        for rank, (chunk, _score) in enumerate(ranked_list):
            scores[chunk.chunk_id] = scores.get(chunk.chunk_id, 0.0) + 1.0 / (k + rank + 1)
            chunk_by_id[chunk.chunk_id] = chunk
    fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [(chunk_by_id[cid], score) for cid, score in fused]
