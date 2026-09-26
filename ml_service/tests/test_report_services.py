from datetime import datetime, timezone

from services.analytics_service import calculate_content_analytics, calculate_document_analytics
from services.chart_service import build_chart_data


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
