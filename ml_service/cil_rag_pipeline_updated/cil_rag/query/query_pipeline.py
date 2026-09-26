import warnings

from ingestion.index_builder import HybridIndex
from ingestion.sqlite_store import list_table_schemas, get_rows_for_table
from query.router import route_query, find_matching_table
from query.rrf import reciprocal_rank_fusion
from query.reranker import rerank as cross_encoder_rerank


def run_query(query: str, index: HybridIndex, conn, k: int = 5, use_vector: bool = False,
              use_reranker: bool = True, candidate_k: int = 30, reranker=None):
    """reranker: optional callable(query, candidates, top_k) -> [(chunk, score)];
    defaults to the cross-encoder in query/reranker.py."""
    schemas = list_table_schemas(conn)
    route = route_query(query, schemas)

    if route == "structured":
        table = find_matching_table(query, schemas)
        rows = get_rows_for_table(conn, table["table_id"])
        return {
            "route": "structured",
            "matched_table": table["table_id"],
            "caption": table["caption"],
            "page_number": table["page_number"],
            "rows": rows,
        }

    # Stage 1 -- recall: pull a wide candidate pool. Cast a wider net when a
    # reranker will narrow it, since the cross-encoder can fix a bad ordering
    # but can't recover a chunk that never made the pool.
    pool = candidate_k if use_reranker else k
    bm25_results = index.bm25_search(query, k=pool)
    if use_vector and index.vectors is not None:
        vector_results = index.vector_search(query, k=pool)
        fused = reciprocal_rank_fusion(bm25_results, vector_results)
    else:
        fused = bm25_results  # BM25-only fallback

    # Stage 2 -- precision: cross-encoder rerank of the pool down to k.
    reranked = False
    results = fused[:k]
    if use_reranker:
        try:
            results = (reranker or cross_encoder_rerank)(query, fused[:pool], top_k=k)
            reranked = True
        except Exception as e:  # e.g. model weights can't be downloaded
            warnings.warn(f"reranker failed ({type(e).__name__}: {e}); "
                          f"falling back to un-reranked top-{k}", stacklevel=2)

    return {"route": "semantic", "results": results, "reranked": reranked}
