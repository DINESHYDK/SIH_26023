"""Convert computed datasets to a stable frontend chart contract."""
from __future__ import annotations
from typing import Any


def build_chart_data(statistics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    charts: list[dict[str, Any]] = []
    for item in statistics:
        data = item.get("data", [])
        if not data:
            continue
        metric = item["metric"]
        if metric == "documents_by_type":
            charts.append({"type": "bar", "title": "Documents by type", "x_axis": "type",
                           "y_axis": "documents", "metric": metric, "data": data})
        elif metric == "uploads_by_day":
            charts.append({"type": "line", "title": "Upload trend", "x_axis": "date",
                           "y_axis": "documents", "metric": metric, "data": data})
    return charts
