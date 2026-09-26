"""PDF renderer for a completed report. Kept independent from the report graph."""
from __future__ import annotations
from pathlib import Path
from typing import Any
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors


def generate_pdf(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    story = [Paragraph(report["title"], styles["Title"]), Spacer(1, 12),
             Paragraph("Executive summary", styles["Heading2"]), Paragraph(report["summary"], styles["BodyText"])]
    for section in report.get("sections", []):
        story.extend([Spacer(1, 8), Paragraph(section["title"], styles["Heading2"]), Paragraph(section["content"], styles["BodyText"])])
    if report.get("charts"):
        story.append(Paragraph("Metrics", styles["Heading2"]))
        for chart in report["charts"]:
            rows = [[chart["x_axis"], chart["y_axis"]]] + [[str(next(iter(point.values()))), str(point.get("value", ""))] for point in chart["data"]]
            table = Table(rows)
            table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey), ("GRID", (0, 0), (-1, -1), .25, colors.grey)]))
            story.extend([Paragraph(chart["title"], styles["Heading3"]), table, Spacer(1, 6)])
    story.append(Paragraph("Sources", styles["Heading2"]))
    story.extend(Paragraph(f"{source['filename']} ({source['document_id']})", styles["BodyText"]) for source in report.get("sources", []))
    if report.get("limitations"):
        story.extend([Paragraph("Limitations", styles["Heading2"]), Paragraph(report["limitations"], styles["BodyText"])])
    SimpleDocTemplate(str(path), pagesize=A4).build(story)
