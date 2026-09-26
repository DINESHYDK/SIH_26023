"""
Second-stage reranking with a cross-encoder.

Why: BM25 and bi-encoder vector search score the query and each chunk
*independently* -- fast, but coarse. A cross-encoder reads (query, chunk)
together in one forward pass, so it can tell that "MoU target for turnover,
excellent category" matches the row whose Turnover / Excellent cells say so,
not just a chunk that shares the words. It's too slow to run over the whole
corpus, so the pipeline is:

    BM25 + vector  ->  RRF fusion  ->  top `candidate_k` (~30)
                   ->  cross-encoder rerank  ->  top `k` (~5)  ->  LLM

Default model is BAAI/bge-reranker-v2-m3 (multilingual, pairs with bge-m3 used
for embeddings). For a much faster English-only option on CPU set
    RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
Weights download from Hugging Face on first use.
"""
import os
from functools import lru_cache

DEFAULT_RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
MAX_LENGTH = 512  # table-row chunks are short; long narrative chunks get truncated here


@lru_cache(maxsize=2)
def _load_model(model_name: str):
    """Loaded once per process -- reloading per query would dominate latency."""
    from sentence_transformers import CrossEncoder
    return CrossEncoder(model_name, max_length=MAX_LENGTH)


def rerank(query: str, candidates: list, top_k: int = 5,
           model=None, model_name: str = None, batch_size: int = 16) -> list:
    """candidates: [(chunk, prior_score), ...] (e.g. RRF output).
    Returns [(chunk, cross_encoder_score), ...] best-first, at most top_k.
    The prior score is discarded; only the cross-encoder decides the order.

    `model` is any object with .predict(list[(query, text)]) -> scores; pass one
    in to reuse a loaded model or to test without downloading weights.
    """
    if not candidates:
        return []
    model = model or _load_model(model_name or DEFAULT_RERANKER_MODEL)
    chunks = [c for c, _ in candidates]
    scores = model.predict([(query, c.text) for c in chunks], batch_size=batch_size)
    ranked = sorted(zip(chunks, (float(s) for s in scores)), key=lambda x: x[1], reverse=True)
    return ranked[:top_k]
