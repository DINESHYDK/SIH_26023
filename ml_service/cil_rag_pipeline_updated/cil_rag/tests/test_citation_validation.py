import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from query.answer import validate_citations
from ingestion.chunker import Chunk


def _chunk(cid):
    return Chunk(chunk_id=cid, chunk_type="narrative", text="x", page_number=1, section_heading=None)


def test_valid_citation_passes():
    provided = [(_chunk("p3_row2"), 1.0)]
    answer = "CIL's PAT was 7020 crore [p3_row2]."
    assert validate_citations(answer, provided) == []


def test_fabricated_citation_is_caught():
    """This is the actual failure mode the check exists for: the model cites
    a chunk ID that sounds plausible but was never in the context it saw."""
    provided = [(_chunk("p3_row2"), 1.0)]
    answer = "CIL's PAT was 7020 crore [p3_row2], per the audit [p99_row7]."
    bad = validate_citations(answer, provided)
    assert bad == ["p99_row7"]


def test_no_citations_returns_empty_not_error():
    provided = [(_chunk("p3_row2"), 1.0)]
    assert validate_citations("I don't know.", provided) == []
