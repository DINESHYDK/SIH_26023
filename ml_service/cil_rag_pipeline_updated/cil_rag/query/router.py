"""
The genuinely agentic decision point in this pipeline: does a query need an
exact structured aggregate (hit SQL, let the database do arithmetic) or
semantic retrieval (hybrid search over chunk text)? A fixed retrieve-then-
generate pipeline doesn't decide anything -- this does.

Kept deliberately simple for a hackathon: match the query against table
captions/columns using cheap keyword overlap. In a fuller build this matching
step would itself use an embedding over each table's schema description
(mentioned in the earlier design discussion), not just substring matching --
worth upgrading first if retrieval accuracy on aggregate questions is the
weak point in a demo.
"""
import re

AGGREGATE_SIGNAL_WORDS = {
    "how many", "total", "sum", "average", "count", "compare", "list all",
    "how much", "what is the target", "which mines", "which projects",
}


def looks_like_aggregate_query(query: str) -> bool:
    q = query.lower()
    return any(sig in q for sig in AGGREGATE_SIGNAL_WORDS)


def find_matching_table(query: str, table_schemas: list):
    """Very simple keyword-overlap match between the query and each table's
    caption + column names. Returns the best-matching schema dict or None."""
    q_words = set(re.findall(r"\w+", query.lower()))
    best, best_score = None, 0
    for schema in table_schemas:
        haystack = " ".join([schema["caption"] or ""] + schema["columns"]).lower()
        h_words = set(re.findall(r"\w+", haystack))
        overlap = len(q_words & h_words)
        if overlap > best_score:
            best, best_score = schema, overlap
    return best if best_score >= 2 else None  # require some real overlap, not one stray word


def route_query(query: str, table_schemas: list) -> str:
    """Returns 'structured' or 'semantic'. Structured only fires if the query
    both LOOKS like an aggregate ask AND matches a known table's schema --
    both conditions, so an aggregate-sounding question with no matching table
    still falls through to semantic search rather than erroring out."""
    if looks_like_aggregate_query(query) and find_matching_table(query, table_schemas):
        return "structured"
    return "semantic"
