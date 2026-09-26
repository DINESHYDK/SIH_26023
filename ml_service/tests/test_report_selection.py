"""Multi-document report selection: per-document budgets, page ranking, date ranges."""
import json
from datetime import date, datetime

import pytest

from agents import document_catalog, report_agent


def test_short_documents_are_sent_whole():
    pages = [{"page": 1, "text": "a" * 10}, {"page": 2, "text": "b" * 10}]
    assert report_agent._select_pages(pages, "anything", budget=100) == pages


def test_long_documents_keep_the_pages_the_instruction_asks_about():
    pages = [{"page": n, "text": f"Annexure-B joint ventures filler {n} " + "x" * 400} for n in range(1, 11)]
    pages[2] = {"page": 3, "text": "Annex - II Mandatory Parameters Part A " + "y" * 400}
    instruction = "visual representation from annex 2 part A"
    # Room for one page: it must be page 3 ("annex 2" matches "Annex - II").
    assert [page["page"] for page in report_agent._select_pages(pages, instruction, budget=500)] == [3]
    chosen = report_agent._select_pages(pages, instruction, budget=1500)
    numbers = [page["page"] for page in chosen]
    assert 3 in numbers and numbers == sorted(numbers)  # still in document order
    assert sum(len(page["text"]) for page in chosen) <= 1500


def test_each_document_is_analysed_separately_and_merged(monkeypatch):
    seen_prompts = []

    def fake_invoke(prompt, schema):
        seen_prompts.append(prompt)
        if schema is report_agent.ReportHeading:
            return {"title": "Combined", "executive_summary": "Both documents."}
        name = "GradeSheet.pdf" if "GradeSheet.pdf" in prompt.split("\n", 1)[0] else "MoU.pdf"
        dataset = {"title": f"{name} data", "chart_type": "line", "x_label": "", "y_label": "", "series": ["v"],
                   "rows": [{"label": "x", "values": [1], "page": 1}]}
        return {"title": name, "executive_summary": f"{name} summary", "findings": [f"{name} finding"],
                "extracted_facts": [], "grade_records": [], "datasets": [dataset], "limitations": []}

    monkeypatch.setattr(report_agent, "_invoke_json", fake_invoke)
    state = {"request": {"instruction": "annex 2 and cgpa graph"}, "document_contents": [
        {"document_id": "a" * 16, "filename": "MoU.pdf", "pages": [{"page": 1, "text": "x" * 200_000}]},
        {"document_id": "b" * 16, "filename": "GradeSheet.pdf", "pages": [{"page": 1, "text": "SGPA 8.37 CGPA 8.37"}]},
    ]}
    merged = report_agent._analyse_document_content(state)["content_analysis"]
    # The GradeSheet got its own call even though the MoU alone exceeds the budget.
    assert any("SGPA 8.37" in prompt for prompt in seen_prompts)
    assert [dataset["source"] for dataset in merged["datasets"]] == ["MoU.pdf", "GradeSheet.pdf"]
    assert merged["title"] == "Combined" and len(merged["per_document"]) == 2


def test_date_range_uses_local_calendar_days(tmp_path, monkeypatch):
    monkeypatch.setattr(document_catalog, "CATALOG_PATH", tmp_path / "catalog.json")
    monkeypatch.setattr(document_catalog, "PROJECT_ROOT", tmp_path)
    local_morning = datetime(2026, 9, 26, 4, 28).astimezone()  # local 04:28 on the 26th
    (tmp_path / "catalog.json").write_text(json.dumps({"d": {
        "document_id": "d", "upload_date": local_morning.isoformat(), "processing_status": "indexed"}}))
    assert [d["document_id"] for d in document_catalog.get_documents_in_range(date(2026, 9, 26), date(2026, 9, 26))] == ["d"]
    assert document_catalog.get_documents_in_range(date(2026, 9, 25), date(2026, 9, 25)) == []


def test_report_request_is_either_files_or_date_range():
    from main import ReportRequest
    assert ReportRequest(file_ids=["a"]).file_ids == ["a"]
    assert ReportRequest(date_from="2026-09-26", date_to="2026-09-26").date_from == date(2026, 9, 26)
    with pytest.raises(Exception, match="not both"):
        ReportRequest(file_ids=["a"], date_from="2026-09-26", date_to="2026-09-26")
