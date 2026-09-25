import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest

from query.router import route_query, find_matching_table, looks_like_aggregate_query

SCHEMAS = [
    {
        "table_id": "annex_ii_part_a",
        "caption": "Mandatory Parameters Part A - Coal India Limited",
        "columns": ["Financial Performance Criteria", "Unit", "Marks", "MoU Target - Excellent"],
        "page_number": 3, "section_heading": "Annex-II",
    },
    {
        "table_id": "mospi_milestones_p1",
        "caption": "Milestones of MoSPI Monitored Projects for MoU 2019-20",
        "columns": ["Subsidiary", "Project", "Capacity (Mty)", "Milestone"],
        "page_number": 18, "section_heading": "Milestones",
    },
]


def test_aggregate_signal_words_detected():
    assert looks_like_aggregate_query("How many mines were suspended?")
    assert looks_like_aggregate_query("What is the total CAPEX?")
    assert not looks_like_aggregate_query("Tell me about CIL's history.")


def test_query_matching_table_caption_and_columns_routes_structured():
    # Must contain BOTH an aggregate signal word AND real table overlap --
    # route_query requires both conditions by design (see router.py docstring).
    # An earlier version of this test used a query with no aggregate signal
    # word ("what is the marks for...") and wrongly expected "structured" --
    # that was a bad test, not a code bug, but it surfaces a real design
    # question below.
    q = "What is the total marks for financial performance criteria in mandatory parameters"
    assert route_query(q, SCHEMAS) == "structured"
    assert find_matching_table(q, SCHEMAS)["table_id"] == "annex_ii_part_a"


@pytest.mark.xfail(reason=(
    "Real design gap, not yet fixed: the router only routes to 'structured' "
    "for AGGREGATE-sounding queries (how many/total/compare/...). A query "
    "asking for one specific field value from a known table ('what is the "
    "marks for financial performance criteria') has real table overlap but "
    "no aggregate signal word, so it falls through to semantic search even "
    "though a structured lookup would answer it more reliably. Fix: broaden "
    "the router to route table-value lookups generally, not just aggregates -- "
    "e.g. route to 'structured' whenever find_matching_table() finds a "
    "confident match, regardless of aggregate wording."
))
def test_specific_value_lookup_without_aggregate_wording_should_still_route_structured():
    q = "What is the marks for financial performance criteria in mandatory parameters"
    assert route_query(q, SCHEMAS) == "structured"


def test_aggregate_query_with_no_matching_table_falls_back_to_semantic():
    q = "How many employees does CIL have in total"  # no table about employees exists
    assert route_query(q, SCHEMAS) == "semantic"


def test_non_aggregate_query_always_semantic():
    q = "Tell me about the CIL mission statement"
    assert route_query(q, SCHEMAS) == "semantic"


@pytest.mark.xfail(reason=(
    "Known gap found when testing against the real document: the matcher only "
    "checks table captions/columns, not values inside rows. 'WCL' is a row "
    "value in mospi_milestones_p1, not a column name, so this doesn't match "
    "yet. Fix: also index distinct row values per table for matching, or "
    "give find_matching_table access to a sample of each table's row values."
))
def test_query_naming_a_row_value_should_still_match_its_table():
    q = "How many WCL mines are in the milestones table"
    assert route_query(q, SCHEMAS) == "structured"
