from datetime import datetime, timezone

import pytest

from services.analytics_service import calculate_content_analytics, calculate_document_analytics
from services.chart_service import CHART_SCHEMA_VERSION, build_chart_data, build_dataset_charts, build_kpis, format_kpi, normalize_chart
from services.report_generator import generate_pdf


def test_analytics_and_chart_contract_is_deterministic():
    documents = [
        {"document_id": "a", "document_type": "typed", "upload_date": "2026-01-01T10:00:00+00:00", "page_count": 2},
        {"document_id": "b", "document_type": "scanned", "upload_date": "2026-01-02T10:00:00+00:00", "page_count": 4},
    ]
    statistics = calculate_document_analytics(documents)
    assert next(item for item in statistics if item["metric"] == "document_count")["value"] == 2
    charts = build_chart_data(statistics)
    assert {chart["metric"] for chart in charts} == {"documents_by_type", "uploads_by_day"}
    assert all(isinstance(chart["data"], list) for chart in charts)


def test_missing_page_counts_are_not_invented():
    statistics = calculate_document_analytics([{"document_id": "a", "document_type": "typed", "upload_date": datetime.now(timezone.utc).isoformat()}])
    assert not any(item["metric"] == "page_statistics" for item in statistics)


def test_grade_metrics_and_charts_use_extracted_rows_only():
    statistics = calculate_content_analytics([
        {"subject": "Mathematics", "marks_obtained": 92, "maximum_marks": 100, "grade": "A+", "page": 1},
        {"subject": "Science", "marks_obtained": 80, "maximum_marks": 100, "grade": "A", "page": 1},
    ])
    summary = next(item for item in statistics if item["metric"] == "marks_summary")
    assert summary["value"] == {"total": 172.0, "average": 86.0, "highest": 92.0, "lowest": 80.0}
    chart_metrics = {item["metric"] for item in build_chart_data(statistics)}
    assert chart_metrics == {"subject_marks", "grade_distribution"}


def test_charts_follow_the_shared_contract():
    statistics = calculate_content_analytics([
        {"subject": "Mathematics", "marks_obtained": 92, "maximum_marks": 100, "grade": "A+", "page": 1},
        {"subject": "Science", "marks_obtained": 80, "maximum_marks": None, "grade": None, "page": 1},
    ]) + calculate_document_analytics([{"document_id": "a", "document_type": "typed", "upload_date": "2026-01-01"}])
    for chart in build_chart_data(statistics):
        assert chart["version"] == CHART_SCHEMA_VERSION
        assert chart["type"] in {"bar", "line"} and chart["x_axis"]["key"] == "label"
        keys = [series["key"] for series in chart["series"]]
        for row in chart["data"]:
            assert isinstance(row["label"], str) and set(row) == {"label", *keys}
            assert all(row[key] is None or isinstance(row[key], float) for key in keys)
    marks = next(chart for chart in build_chart_data(statistics) if chart["id"] == "subject_marks")
    assert marks["data"][1] == {"label": "Science", "value": 80.0, "maximum": None}


def test_normalize_chart_drops_empty_series_and_rejects_unknown_types():
    chart = normalize_chart({"type": "bar", "metric": "m", "series": [{"key": "a"}, {"key": "b"}],
                             "data": [{"label": "x", "a": 1, "b": "n/a"}, {"label": "", "a": 2}]})
    assert chart["series"] == [{"key": "a", "label": "a"}] and chart["data"] == [{"label": "x", "a": 1.0}]
    assert normalize_chart({"type": "bar", "series": [{"key": "a"}], "data": [{"label": "x", "a": None}]}) is None
    with pytest.raises(ValueError):
        normalize_chart({"type": "pie", "series": [], "data": []})


def test_kpis_are_flattened_and_formatted():
    kpis = build_kpis([{"metric": "document_count", "value": 3, "data": []}, {"metric": "percentage", "value": 86.5, "data": []}])
    assert [format_kpi(kpi) for kpi in kpis] == ["3", "86.50%"]


def test_pdf_renders_charts_and_escapes_text(tmp_path):
    statistics = calculate_content_analytics([
        {"subject": "Maths & <Stats>", "marks_obtained": 92, "maximum_marks": 100, "grade": "A", "page": 1}])
    path = tmp_path / "report.pdf"
    generate_pdf({"title": "R & D <draft>", "summary": "a < b", "sections": [], "kpis": build_kpis(statistics),
                  "charts": build_chart_data(statistics), "sources": [], "limitations": ""}, path)
    assert path.read_bytes().startswith(b"%PDF")


def test_extracted_datasets_become_contract_charts():
    charts = build_dataset_charts([{
        "title": "Semester vs SGPA and CGPA", "chart_type": "line", "x_label": "Semester", "y_label": "Grade point",
        "series": ["SGPA", "CGPA"],
        "rows": [{"label": "2024-25 Monsoon", "values": [8.37, "8.37"], "page": 1},
                 {"label": "2024-25 Winter", "values": [8.32, "N/A"], "page": 1}],
    }])
    assert len(charts) == 1
    chart = charts[0]
    assert chart["type"] == "line" and chart["y_axis"]["min"] is None
    assert chart["series"] == [{"key": "s0", "label": "SGPA"}, {"key": "s1", "label": "CGPA"}]
    assert chart["data"] == [{"label": "2024-25 Monsoon", "s0": 8.37, "s1": 8.37},
                             {"label": "2024-25 Winter", "s0": 8.32, "s1": None}]
    bar = build_dataset_charts([{"title": "t", "chart_type": "bar", "series": ["a"], "rows": [{"label": "x", "values": [5]}]}])[0]
    assert bar["y_axis"]["min"] == 0
