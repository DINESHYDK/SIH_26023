"""
Layer 1 of testing: unit tests for pure functions. No API key, no network,
runs in milliseconds. These catch the mechanical bugs (wrong chunk count,
missing context prefix, header dropped from a row sentence) before you ever
get to the harder question of whether retrieval finds the right thing.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingestion.chunker import chunk_page, chunk_table_rows, _recursive_split
from ingestion.vision_extract import ExtractedPage, ExtractedTable


def test_narrative_chunk_carries_heading_context():
    page = ExtractedPage(
        page_number=1, section_heading="Annex-I: Brief about CIL",
        narrative_text="CIL produces coal.", tables=[],
    )
    chunks = chunk_page(page)
    assert len(chunks) == 1
    assert chunks[0].text.startswith("[Annex-I: Brief about CIL]")
    assert "CIL produces coal." in chunks[0].text


def test_table_row_bakes_header_into_sentence():
    """This is the specific fix for the mines-A-D-vs-E-H disambiguation
    problem -- the column name must travel WITH the value, not just live in
    a separate header the row doesn't carry."""
    table = ExtractedTable(
        table_id="t1", caption="Mine production 2016",
        columns=["Mine", "Volume"],
        rows=[{"Mine": "C", "Volume": "8200"}],
    )
    page = ExtractedPage(page_number=1, section_heading="Production", narrative_text="", tables=[table])
    chunks = chunk_table_rows(page, table)
    assert len(chunks) == 1
    text = chunks[0].text
    assert "Mine: C" in text  # header baked in, not bare "C"
    assert "Volume: 8200" in text
    assert "Mine production 2016" in text  # caption context prefix present


def test_table_row_empty_values_are_dropped():
    table = ExtractedTable(
        table_id="t1", caption=None, columns=["A", "B"],
        rows=[{"A": "x", "B": ""}],  # empty value shouldn't produce "B: "
    )
    page = ExtractedPage(page_number=1, section_heading=None, narrative_text="", tables=[table])
    chunks = chunk_table_rows(page, table)
    assert "B:" not in chunks[0].text


def test_recursive_split_respects_max_chars():
    long_text = "Sentence one. " * 200  # ~2800 chars
    pieces = _recursive_split(long_text, max_chars=500)
    assert all(len(p) <= 550 for p in pieces)  # small slack for sentence boundaries
    assert len(pieces) > 1


def test_recursive_split_short_text_stays_one_chunk():
    pieces = _recursive_split("Short text.", max_chars=500)
    assert pieces == ["Short text."]


def test_chunk_page_counts_narrative_and_table_rows_separately():
    table = ExtractedTable(table_id="t1", caption="C", columns=["X"], rows=[{"X": "1"}, {"X": "2"}])
    page = ExtractedPage(page_number=1, section_heading="H", narrative_text="Some prose here.", tables=[table])
    chunks = chunk_page(page)
    narrative = [c for c in chunks if c.chunk_type == "narrative"]
    table_rows = [c for c in chunks if c.chunk_type == "table_row"]
    assert len(narrative) == 1
    assert len(table_rows) == 2
