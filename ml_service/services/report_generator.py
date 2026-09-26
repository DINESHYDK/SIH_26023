"""PDF renderer for a completed report. Kept independent from the report graph.

Charts arrive in the contract defined in ``services.chart_service`` and are
drawn as real vector charts (reportlab.graphics), each followed by its data
table so exact values survive printing and greyscale.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.widgets.markers import makeMarker
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services.chart_service import format_kpi

# Categorical slots, light-surface steps. Assigned by series index in fixed
# order — must stay in the same order as SERIES_COLORS in the frontend's
# ReportChartView so a series has the same identity on screen and on paper.
SERIES_COLORS = [colors.HexColor(value) for value in
                 ("#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948")]
INK = colors.HexColor("#0b0b0b")
INK_MUTED = colors.HexColor("#52514e")
GRID = colors.HexColor("#e2e2de")
HEADER_FILL = colors.HexColor("#f1f1ee")

CHART_WIDTH = 170 * mm
CHART_HEIGHT = 70 * mm
MAX_LABEL = 18


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    """Paragraph with markup-escaped text — LLM output may contain & or <."""
    return Paragraph(escape(str(text or "")), style)


def _short(label: str) -> str:
    return label if len(label) <= MAX_LABEL else label[: MAX_LABEL - 1] + "…"


def _value_text(value: float | None, unit: str | None) -> str:
    if value is None:
        return "—"
    text = f"{int(value):,}" if float(value).is_integer() else f"{value:,.2f}"
    return f"{text}%" if unit == "%" else text


def _chart_drawing(chart: dict[str, Any]) -> Drawing:
    series, rows = chart["series"], chart["data"]
    labels = [_short(row["label"]) for row in rows]
    values = [[row.get(item["key"]) for row in rows] for item in series]
    numbers = [value for column in values for value in column if value is not None]
    rotate = len(rows) > 6 or any(len(label) > 8 for label in labels)
    legend_height = 14 if len(series) > 1 else 0
    # Rotated labels hang ~sin(30°) of their length below the axis.
    bottom = 16 + int(max(len(label) for label in labels) * 2.2) if rotate else 22

    drawing = Drawing(CHART_WIDTH, CHART_HEIGHT)
    plot = VerticalBarChart() if chart["type"] == "bar" else HorizontalLineChart()
    plot.x, plot.y = 42, bottom
    plot.width, plot.height = CHART_WIDTH - 54, CHART_HEIGHT - bottom - 12 - legend_height
    plot.data = values
    plot.categoryAxis.categoryNames = labels
    plot.categoryAxis.labels.fontName = "Helvetica"
    plot.categoryAxis.labels.fontSize = 7
    plot.categoryAxis.labels.fillColor = INK_MUTED
    plot.categoryAxis.strokeColor = GRID
    if rotate:
        plot.categoryAxis.labels.angle = 30
        plot.categoryAxis.labels.boxAnchor = "ne"
        plot.categoryAxis.labels.dx, plot.categoryAxis.labels.dy = 0, -6
    else:
        plot.categoryAxis.labels.boxAnchor = "n"
        plot.categoryAxis.labels.dy = -3

    axis = plot.valueAxis
    y_min = chart["y_axis"].get("min")
    low, high = min(numbers), max(numbers)
    if y_min is not None:
        axis.valueMin, axis.valueMax = y_min, max(high * 1.1, y_min + 1)
    else:  # fitted axis (line charts): pad so no point sits on the frame
        pad = max((high - low) * 0.25, abs(high) * 0.02, 0.1)
        axis.valueMin, axis.valueMax = low - pad, high + pad
    axis.labels.fontName, axis.labels.fontSize, axis.labels.fillColor = "Helvetica", 7, INK_MUTED
    axis.strokeColor = colors.transparent
    axis.visibleGrid, axis.gridStrokeColor, axis.gridStrokeWidth = True, GRID, 0.5
    axis.labelTextFormat = lambda value: _value_text(value, chart["y_axis"].get("unit"))
    if y_min is not None and all(float(value).is_integer() for value in numbers) and axis.valueMax - axis.valueMin <= 10:
        axis.valueStep = 1  # counts: no 0.5 ticks

    for index in range(len(series)):
        color = SERIES_COLORS[index % len(SERIES_COLORS)]
        if chart["type"] == "bar":
            plot.bars[index].fillColor = color
            plot.bars[index].strokeColor = None
        else:
            plot.lines[index].strokeColor = color
            plot.lines[index].strokeWidth = 1.5
            plot.lines[index].symbol = makeMarker("FilledCircle", size=4, fillColor=color, strokeColor=color)
    if chart["type"] == "bar":
        plot.groupSpacing, plot.barSpacing = 6, 1.5
    drawing.add(plot)

    y_label = chart["y_axis"].get("label")
    if y_label:
        drawing.add(String(0, CHART_HEIGHT - 6, y_label, fontName="Helvetica", fontSize=7, fillColor=INK_MUTED))
    if len(series) > 1:
        legend = Legend()
        legend.x, legend.y = CHART_WIDTH, CHART_HEIGHT - 2
        legend.alignment = "right"
        legend.columnMaximum, legend.deltax = 1, 90
        legend.dx = legend.dy = 7
        legend.fontName, legend.fontSize, legend.fillColor = "Helvetica", 7, INK_MUTED
        legend.boxAnchor = "ne"
        legend.colorNamePairs = [(SERIES_COLORS[index % len(SERIES_COLORS)], item["label"])
                                 for index, item in enumerate(series)]
        drawing.add(legend)
    return drawing


def _grid_style() -> TableStyle:
    return TableStyle([("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL), ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                       ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
                       ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("LINEBELOW", (0, 0), (-1, -1), 0.25, GRID),
                       ("VALIGN", (0, 0), (-1, -1), "MIDDLE")])


def _chart_table(chart: dict[str, Any]) -> Table:
    unit = chart["y_axis"].get("unit")
    header = [chart["x_axis"].get("label") or "Label"] + [item["label"] for item in chart["series"]]
    rows = [[row["label"]] + [_value_text(row.get(item["key"]), unit) for item in chart["series"]] for row in chart["data"]]
    table = Table([header] + rows, hAlign="LEFT", repeatRows=1)
    table.setStyle(_grid_style())
    return table


def _kpi_grid(kpis: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> Table:
    per_row = 4
    cells = [[_p(format_kpi(kpi), styles["kpi_value"]), _p(kpi["label"], styles["kpi_label"])] for kpi in kpis]
    cells += [""] * (-len(cells) % per_row)
    table = Table([cells[i:i + per_row] for i in range(0, len(cells), per_row)],
                  colWidths=[CHART_WIDTH / per_row] * per_row, hAlign="LEFT")
    table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.25, GRID), ("INNERGRID", (0, 0), (-1, -1), 0.25, GRID),
                               ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 6),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return table


def generate_pdf(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = getSampleStyleSheet()
    styles = {
        "title": base["Title"], "h2": base["Heading2"], "h3": base["Heading3"], "body": base["BodyText"],
        "muted": ParagraphStyle("muted", parent=base["BodyText"], fontSize=8, textColor=INK_MUTED),
        "kpi_value": ParagraphStyle("kpi_value", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=INK),
        "kpi_label": ParagraphStyle("kpi_label", parent=base["BodyText"], fontSize=7.5, leading=9, textColor=INK_MUTED),
    }
    generated = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    story: list[Any] = [_p(report["title"], styles["title"]), _p(f"Generated {generated}", styles["muted"]), Spacer(1, 10),
                        _p("Executive summary", styles["h2"]), _p(report["summary"], styles["body"])]
    if report.get("kpis"):
        story.extend([Spacer(1, 8), _p("Key figures", styles["h2"]), _kpi_grid(report["kpis"], styles)])
    for section in report.get("sections", []):
        story.extend([Spacer(1, 8), _p(section["title"], styles["h2"]), _p(section["content"], styles["body"])])
    if report.get("charts"):
        story.extend([Spacer(1, 8), _p("Charts", styles["h2"])])
        for chart in report["charts"]:
            block = [_p(chart["title"], styles["h3"])]
            if chart.get("description"):
                block.append(_p(chart["description"], styles["muted"]))
            block.extend([Spacer(1, 4), _chart_drawing(chart), Spacer(1, 4)])
            story.extend([KeepTogether(block), _chart_table(chart), Spacer(1, 10)])
    story.append(_p("Sources", styles["h2"]))
    story.extend(_p(f"{source['filename']} ({source['document_id']})", styles["body"]) for source in report.get("sources", []))
    if report.get("limitations"):
        story.extend([_p("Limitations", styles["h2"]), _p(report["limitations"], styles["body"])])
    SimpleDocTemplate(str(path), pagesize=A4, title=str(report["title"]),
                      leftMargin=20 * mm, rightMargin=20 * mm).build(story)
