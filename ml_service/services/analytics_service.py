"""Deterministic report metrics. Never infer values that are absent from metadata."""
from __future__ import annotations
from collections import Counter
from typing import Any


def calculate_document_analytics(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_type = Counter(item.get("document_type", "unknown") for item in documents)
    by_day = Counter(item.get("upload_date", "")[:10] for item in documents if item.get("upload_date"))
    pages = [item["page_count"] for item in documents if isinstance(item.get("page_count"), int)]
    result: list[dict[str, Any]] = [
        {"metric": "document_count", "value": len(documents), "data": []},
        {"metric": "documents_by_type", "data": [{"type": key, "value": value} for key, value in sorted(by_type.items())]},
        {"metric": "uploads_by_day", "data": [{"date": key, "value": value} for key, value in sorted(by_day.items())]},
    ]
    if pages:
        result.append({"metric": "page_statistics", "value": {"total": sum(pages), "average": round(sum(pages) / len(pages), 2), "known_documents": len(pages)}, "data": []})
    return result


def calculate_content_analytics(grade_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Calculate grade metrics only from values extracted from cited document text."""
    valid = [record for record in grade_records if isinstance(record.get("marks_obtained"), (int, float))]
    results: list[dict[str, Any]] = []
    if valid:
        marks = [float(record["marks_obtained"]) for record in valid]
        results.append({"metric": "marks_summary", "value": {"total": round(sum(marks), 2), "average": round(sum(marks) / len(marks), 2), "highest": round(max(marks), 2), "lowest": round(min(marks), 2)}, "data": []})
        results.append({"metric": "subject_marks", "data": [
            {"subject": str(record.get("subject") or "Unlabelled"), "value": float(record["marks_obtained"]),
             "maximum": float(record["maximum_marks"]) if isinstance(record.get("maximum_marks"), (int, float)) else None}
            for record in valid]})
        maximum = [float(record["maximum_marks"]) for record in valid if isinstance(record.get("maximum_marks"), (int, float))]
        if len(maximum) == len(valid) and sum(maximum) > 0:
            results.append({"metric": "percentage", "value": round(sum(marks) * 100 / sum(maximum), 2), "data": []})
    grades = Counter(str(record["grade"]) for record in grade_records if record.get("grade"))
    if grades:
        # Rank order (A+, A, A-, B+, ...), not string order (A, A+, B, B+).
        rank = lambda grade: (grade.rstrip("+-"), {"+": 0, "-": 2}.get(grade[-1:], 1))
        results.append({"metric": "grade_distribution", "data": [{"grade": key, "value": value} for key, value in sorted(grades.items(), key=lambda item: rank(item[0]))]})
    return results
