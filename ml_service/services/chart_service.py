"""Convert computed datasets to a stable chart/KPI contract.

One shape feeds both renderers — the frontend (SVG) and the PDF
(reportlab) — so neither has to guess how a chart is laid out.

Chart contract (``CHART_SCHEMA_VERSION``)::

    {
      "version": "1.0",
      "id": "subject_marks",            # stable, unique within a report
      "metric": "subject_marks",        # statistic the chart was built from
      "type": "bar" | "line",
      "title": "Marks by subject",
      "description": "..." | None,
      "x_axis": {"key": "label", "label": "Subject", "kind": "category" | "time"},
      "y_axis": {"label": "Marks", "unit": None | "%" | ..., "min": 0 | None},  # bar: always 0; None = fit data
      "series": [{"key": "value", "label": "Marks obtained"}, ...],
      "data": [{"label": "Mathematics", "value": 92.0, "maximum": 100.0}, ...],
    }

Rules every chart obeys (enforced by ``normalize_chart``):
  * every data row has a string ``label`` (the x value) — renderers never
    need to guess which key is the category;
  * every series key maps to a finite number or ``None`` (a gap), never a
    string; a series with no numbers at all is dropped;
  * series order is the colour order — renderers assign palette slots by
    series index, so the same series keeps the same colour everywhere.

KPI contract::

    {"id": "marks_average", "label": "Average marks", "value": 86.0,
     "unit": None | "%" | "pages", "metric": "marks_summary"}
"""
from __future__ import annotations

import math
from typing import Any

CHART_SCHEMA_VERSION = "1.0"
CHART_TYPES = {"bar", "line"}
AXIS_KINDS = {"category", "time"}


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def normalize_chart(chart: dict[str, Any]) -> dict[str, Any] | None:
    """Validate and coerce a chart to the contract; ``None`` if nothing plottable remains."""
    if chart.get("type") not in CHART_TYPES:
        raise ValueError(f"Unsupported chart type: {chart.get('type')!r}")
    series = [dict(item) for item in chart.get("series") or [] if item.get("key") and item.get("key") != "label"]
    rows = []
    for point in chart.get("data") or []:
        label = point.get("label")
        if label is None or str(label).strip() == "":
            continue
        rows.append({"label": str(label), **{item["key"]: _number(point.get(item["key"])) for item in series}})
    series = [item for item in series if any(row[item["key"]] is not None for row in rows)]
    if not rows or not series:
        return None
    keep = {"label"} | {item["key"] for item in series}
    x_axis = {"key": "label", "label": "", "kind": "category", **(chart.get("x_axis") or {})}
    if x_axis["kind"] not in AXIS_KINDS:
        x_axis["kind"] = "category"
    x_axis["key"] = "label"
    y_axis = {"label": "", "unit": None, "min": 0, **(chart.get("y_axis") or {})}
    if chart["type"] == "bar":
        y_axis["min"] = 0
    return {
        "version": CHART_SCHEMA_VERSION,
        "id": chart.get("id") or chart.get("metric"),
        "metric": chart.get("metric"),
        "type": chart["type"],
        "title": chart.get("title") or "",
        "description": chart.get("description"),
        "x_axis": x_axis,
        "y_axis": y_axis,
        "series": [{"key": item["key"], "label": item.get("label") or item["key"]} for item in series],
        "data": [{key: value for key, value in row.items() if key in keep} for row in rows],
    }


def _rows(data: list[dict[str, Any]], label_key: str) -> list[dict[str, Any]]:
    return [{**point, "label": point.get(label_key)} for point in data]


def build_chart_data(statistics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    charts: list[dict[str, Any]] = []
    for item in statistics:
        data = item.get("data", [])
        if not data:
            continue
        metric = item["metric"]
        spec: dict[str, Any] | None = None
        if metric == "documents_by_type":
            spec = {"type": "bar", "title": "Documents by type",
                    "x_axis": {"label": "Document type"}, "y_axis": {"label": "Documents"},
                    "series": [{"key": "value", "label": "Documents"}], "data": _rows(data, "type")}
        elif metric == "uploads_by_day":
            spec = {"type": "line", "title": "Upload trend",
                    "x_axis": {"label": "Date", "kind": "time"}, "y_axis": {"label": "Documents"},
                    "series": [{"key": "value", "label": "Uploads"}], "data": _rows(data, "date")}
        elif metric == "subject_marks":
            spec = {"type": "bar", "title": "Marks by subject",
                    "description": "Marks as printed in the source document; maximum marks shown where stated.",
                    "x_axis": {"label": "Subject"}, "y_axis": {"label": "Marks"},
                    "series": [{"key": "value", "label": "Marks obtained"}, {"key": "maximum", "label": "Maximum marks"}],
                    "data": _rows(data, "subject")}
        elif metric == "grade_distribution":
            spec = {"type": "bar", "title": "Grade distribution",
                    "x_axis": {"label": "Grade"}, "y_axis": {"label": "Subjects"},
                    "series": [{"key": "value", "label": "Subjects"}], "data": _rows(data, "grade")}
        if spec:
            chart = normalize_chart({"id": metric, "metric": metric, **spec})
            if chart:
                charts.append(chart)
    return charts


def _cell(value: Any) -> float | None:
    """Numbers the model copied from the page, possibly as strings ("8.37", "92/100" is not a number)."""
    if isinstance(value, str):
        try:
            value = float(value.strip().replace(",", ""))
        except ValueError:
            return None
    return _number(value)


def build_dataset_charts(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Charts for numeric tables extracted verbatim from documents (content_analysis.datasets)."""
    charts: list[dict[str, Any]] = []
    for index, dataset in enumerate(datasets):
        names = [str(name) for name in dataset.get("series") or []]
        keys = [f"s{position}" for position in range(len(names))]
        rows = [{"label": row.get("label"), **{key: _cell(value) for key, value in zip(keys, row.get("values") or [])}}
                for row in dataset.get("rows") or []]
        chart_type = dataset.get("chart_type") if dataset.get("chart_type") in CHART_TYPES else "bar"
        chart = normalize_chart({
            "id": f"dataset_{index}", "metric": "extracted_dataset", "type": chart_type,
            "title": dataset.get("title") or "Extracted values",
            "description": f"Values as printed in {dataset['source']}." if dataset.get("source")
                           else "Values as printed in the source document.",
            "x_axis": {"label": dataset.get("x_label") or ""},
            # Bars encode length, so they need a zero baseline; lines encode
            # change, so let the axis fit the data (e.g. GPAs of 7.9–8.4).
            "y_axis": {"label": dataset.get("y_label") or "", "min": 0 if chart_type == "bar" else None},
            "series": [{"key": key, "label": name} for key, name in zip(keys, names)],
            "data": rows,
        })
        if chart:
            charts.append(chart)
    return charts


# (statistic, value key or None for scalar) -> (kpi id, label, unit)
_KPI_FIELDS: dict[tuple[str, str | None], tuple[str, str, str | None]] = {
    ("document_count", None): ("document_count", "Documents analysed", None),
    ("page_statistics", "total"): ("pages_total", "Total pages", "pages"),
    ("page_statistics", "average"): ("pages_average", "Average pages per document", "pages"),
    ("marks_summary", "total"): ("marks_total", "Total marks", None),
    ("marks_summary", "average"): ("marks_average", "Average marks", None),
    ("marks_summary", "highest"): ("marks_highest", "Highest marks", None),
    ("marks_summary", "lowest"): ("marks_lowest", "Lowest marks", None),
    ("percentage", None): ("percentage", "Overall percentage", "%"),
}


def build_kpis(statistics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten scalar statistics into headline numbers (stat tiles / PDF KPI table)."""
    kpis: list[dict[str, Any]] = []
    for item in statistics:
        value = item.get("value")
        fields = [(None, value)] if not isinstance(value, dict) else list(value.items())
        for key, raw in fields:
            meta = _KPI_FIELDS.get((item["metric"], key))
            number = _number(raw)
            if meta and number is not None:
                kpis.append({"id": meta[0], "label": meta[1], "value": number, "unit": meta[2], "metric": item["metric"]})
    return kpis


def format_kpi(kpi: dict[str, Any]) -> str:
    value = kpi["value"]
    text = f"{int(value):,}" if float(value).is_integer() else f"{value:,.2f}"
    unit = kpi.get("unit")
    if unit == "%":
        return f"{text}%"
    return f"{text} {unit}" if unit else text
