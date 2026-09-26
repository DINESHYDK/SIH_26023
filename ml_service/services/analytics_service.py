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
