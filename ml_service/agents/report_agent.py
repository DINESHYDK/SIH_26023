"""LangGraph workflow for grounded, asynchronous analytical reports."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Literal, TypedDict

from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from agents.document_catalog import get_documents, get_documents_in_range
from agents.scanned_rag import scanned_document_rag
from agents.typed_rag import typed_document_rag
from services.analytics_service import calculate_content_analytics, calculate_document_analytics
from services.chart_service import build_chart_data, build_dataset_charts, build_kpis, format_kpi
from services.report_generator import generate_pdf


class ReportState(TypedDict, total=False):
    request: dict[str, Any]
    document_ids: list[str]
    documents: list[dict[str, Any]]
    document_contents: list[dict[str, Any]]
    content_analysis: dict[str, Any]
    analysis_plan: dict[str, Any]
    statistics: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    findings: list[dict[str, Any]]
    charts: list[dict[str, Any]]
    report: dict[str, Any]
    report_path: str


class AnalysisPlan(BaseModel):
    title: str
    analyses: list[str]


class GradeRecord(BaseModel):
    subject: str
    marks_obtained: float | None = None
    maximum_marks: float | None = None
    grade: str | None = None
    page: int


class DatasetRow(BaseModel):
    label: str
    # Any: the model may emit "8.37" or "N/A"; chart_service coerces/drops.
    values: list[Any] = Field(default_factory=list)
    page: int | None = None


class Dataset(BaseModel):
    """Numeric table copied verbatim from the document, to be charted."""
    title: str
    chart_type: Literal["bar", "line"] = "bar"
    x_label: str = ""
    y_label: str = ""
    series: list[str] = Field(default_factory=list)
    rows: list[DatasetRow] = Field(default_factory=list)


class ContentAnalysis(BaseModel):
    title: str
    executive_summary: str
    findings: list[str] = Field(default_factory=list)
    extracted_facts: list[str] = Field(default_factory=list)
    grade_records: list[GradeRecord] = Field(default_factory=list)
    datasets: list[Dataset] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


def _parse_json_object(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of an LLM reply.

    openrouter/auto routes to a different model per call; some wrap the JSON
    in prose or ``` fences, some return nothing. Plain json.loads fails on all
    of those with "Expecting value: line 1 column 1".
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("model returned an empty response")
    start = text.find("{")
    if start == -1:
        raise ValueError(f"no JSON object in model response: {text[:200]!r}")
    parsed, _ = json.JSONDecoder().raw_decode(text[start:])
    if not isinstance(parsed, dict):
        raise ValueError("model response JSON is not an object")
    return parsed


def _resolve_documents(state: ReportState) -> ReportState:
    request = state["request"]
    ids = request.get("file_ids") or []
    documents = get_documents(ids) if ids else get_documents_in_range(request["date_from"], request["date_to"])
    if not documents:
        raise ValueError("No indexed documents match the requested selection")
    unavailable = [item["document_id"] for item in documents if item.get("processing_status") != "indexed"]
    if unavailable:
        raise ValueError("Documents are still processing: " + ", ".join(unavailable))
    return {"document_ids": [item["document_id"] for item in documents], "documents": documents}


def _load_document_content(state: ReportState) -> ReportState:
    """Load selected content directly; reports must never start from metadata."""
    documents = []
    for document in state["documents"]:
        if document["document_type"] == "typed":
            pages = [{"page": chunk["page"], "text": chunk["text"]}
                     for chunk in typed_document_rag.read_chunks(document["document_id"])]
        else:
            cache = scanned_document_rag._paths(document["document_id"])["cache"]
            pages = []
            for page_file in sorted(cache.glob("page_*.json")):
                try:
                    raw = json.loads(page_file.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if isinstance(raw, dict):
                    text = json.dumps({key: value for key, value in raw.items()
                                       if key not in {"image_base64", "image_mime_type"}}, ensure_ascii=False)
                    pages.append({"page": raw.get("page_number", len(pages) + 1), "text": text})
        if not pages:
            raise ValueError(f"No extracted content is available for {document['filename']}; reprocess it before reporting.")
        documents.append({"document_id": document["document_id"], "filename": document["filename"], "pages": pages})
    return {"document_contents": documents}


def _content_model() -> ChatOpenRouter:
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPEN_ROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required for content-based report generation")
    return ChatOpenRouter(model=os.getenv("OPENROUTER_MODEL", "openrouter/auto"), api_key=api_key, temperature=0.1)


def _analyse_document_content(state: ReportState) -> ReportState:
    """Use the LLM only after supplying actual extracted page text and citations."""
    remaining = 50_000
    context = []
    for document in state["document_contents"]:
        for page in document["pages"]:
            fragment = f"[{document['document_id']} p{page['page']}] {page['text']}\n"
            context.append(fragment[:remaining])
            remaining -= len(fragment)
            if remaining <= 0:
                break
        if remaining <= 0:
            break
    if not context:
        raise ValueError("No usable document text was available for analysis")
    instruction = state["request"].get("instruction") or "Provide a factual analysis of these documents."
    prompt = f'''Analyse only this document content for the user's request: {instruction}
Return JSON only: {{"title":"...","executive_summary":"...","findings":["..."],"extracted_facts":["..."],"grade_records":[{{"subject":"...","marks_obtained":number-or-null,"maximum_marks":number-or-null,"grade":"..."-or-null,"page":number}}],"datasets":[{{"title":"...","chart_type":"bar"|"line","x_label":"...","y_label":"...","series":["..."],"rows":[{{"label":"...","values":[number-or-null],"page":number}}]}}],"limitations":["..."]}}.
For a gradesheet, extract every explicit subject/marks/maximum/grade row. Do not calculate or invent values. Every fact and finding must cite [document_id pN]. Use null for unclear cells.
"datasets" holds the numeric tables to chart. Whenever the request asks for a graph, chart, trend or comparison, or the document has a numeric table (per period, per item, per category), add a dataset: one row per x-axis value in document order, "values" in the same order as "series" (e.g. series ["SGPA","CGPA"], one row per semester). Copy numbers exactly as printed; never calculate them. Use "line" for values over time/periods, "bar" otherwise.
Reply with the JSON object only: no prose, no markdown.
Document content:
{''.join(context)}'''
    errors = []
    for attempt in range(2):
        try:
            response = _content_model().invoke(prompt if attempt == 0 else
                                               prompt + "\n\nYour previous reply was not a valid JSON object. Reply with ONLY the JSON object.")
            parsed = _parse_json_object(str(response.content))
            analysis = ContentAnalysis.model_validate(parsed) if hasattr(ContentAnalysis, "model_validate") else ContentAnalysis.parse_obj(parsed)
            break
        except Exception as exc:
            errors.append(str(exc))
    else:
        raise RuntimeError("Content analysis failed: " + " | ".join(errors))
    return {"content_analysis": analysis.model_dump() if hasattr(analysis, "model_dump") else analysis.dict()}


def _execute_content_analytics(state: ReportState) -> ReportState:
    return {"statistics": calculate_content_analytics(state["content_analysis"]["grade_records"])}


def _compose_content_report(state: ReportState) -> ReportState:
    analysis = state["content_analysis"]
    kpis = build_kpis(state["statistics"])
    metrics = [f"{kpi['label']}: {format_kpi(kpi)}" for kpi in kpis]
    report = {"title": analysis["title"], "summary": analysis["executive_summary"], "sections": [
        {"title": "Analytical findings", "content": " ".join(analysis["findings"]) or "No grounded findings were returned."},
        {"title": "Document-derived facts", "content": " ".join(analysis["extracted_facts"]) or "No additional facts were extracted."},
        {"title": "Computed grade metrics", "content": "; ".join(metrics) or "No numeric grade rows were explicitly extractable."},
    ], "findings": [{"finding": finding, "severity": "content", "supporting_metrics": [], "evidence": []} for finding in analysis["findings"]],
        "grade_records": analysis["grade_records"], "statistics": state["statistics"], "kpis": kpis, "charts": state["charts"],
        "sources": [{"document_id": item["document_id"], "filename": item["filename"]} for item in state["documents"]],
        "limitations": " ".join(analysis["limitations"] or ["Analysis is limited to extracted document content."])}
    return {"report": report}


def _plan_analysis(state: ReportState) -> ReportState:
    # The executable plan is deliberately restricted to metrics the deterministic
    # tool exposes. An LLM may name it, but cannot select unsupported calculations.
    instruction = state["request"].get("instruction") or ""
    title = "Document portfolio analysis"
    if instruction:
        title = instruction.strip()[:120]
    # This LLM node is intentionally limited to naming/prioritising a plan.
    # The only executable analyses remain the deterministic allow-list below.
    api_key = os.getenv("OPEN_ROUTER_API_KEY") #or os.getenv("OPEN_ROUTER_API_KEY")
    if api_key:
        prompt = ("Return JSON only in the shape {\"title\": string, \"analyses\": [string]}. "
                  "Do not invent facts. Analyses can only be document_count, documents_by_type, uploads_by_day, page_statistics. "
                  f"User instruction: {instruction or 'Summarize the selected documents'}. "
                  f"Selected metadata: {state['documents']}")
        try:
            response = ChatOpenRouter(model="openrouter/auto", api_key=api_key, temperature=0.2).invoke(prompt)
            parsed = json.loads(str(response.content).strip())
            proposed = AnalysisPlan.model_validate(parsed) if hasattr(AnalysisPlan, "model_validate") else AnalysisPlan.parse_obj(parsed)
            if proposed.title:
                title = proposed.title[:120]
        except Exception:
            # A report is still useful offline; limitations disclose that only
            # deterministic metadata interpretation was available.
            pass
    return {"analysis_plan": {"title": title, "analyses": ["document_count", "documents_by_type", "uploads_by_day", "page_statistics"]}}


def _execute_analytics(state: ReportState) -> ReportState:
    return {"statistics": calculate_document_analytics(state["documents"])}


def _retrieve_evidence(state: ReportState) -> ReportState:
    query = state["request"].get("instruction") or "key facts, findings, dates and quantities"
    evidence: list[dict[str, Any]] = []
    # Retrieval is only evidence gathering after deterministic document selection.
    for document in state["documents"]:
        try:
            if document["document_type"] == "typed":
                matches = typed_document_rag.retrieve(query, document["document_id"], k=2)
                evidence.extend({"document_id": document["document_id"], "filename": document["filename"], "page": item["page"], "text": item["text"]} for item in matches)
            else:
                result = scanned_document_rag.retrieve(query, document["document_id"], k=2)
                if result["route"] == "structured":
                    evidence.append({"document_id": document["document_id"], "filename": document["filename"], "page": result["page_number"], "text": str(result["rows"])})
                else:
                    evidence.extend({"document_id": document["document_id"], "filename": document["filename"], "page": chunk.page_number, "text": chunk.text} for chunk, _ in result["results"][:2])
        except Exception as exc:
            evidence.append({"document_id": document["document_id"], "filename": document["filename"], "error": str(exc)})
    return {"evidence": evidence}


def _interpret_findings(state: ReportState) -> ReportState:
    count = next(item["value"] for item in state["statistics"] if item["metric"] == "document_count")
    retrieval_failures = sum("error" in item for item in state["evidence"])
    findings = [{"finding": f"The selected scope contains {count} indexed document(s).", "severity": "info", "supporting_metrics": ["document_count"], "evidence": []}]
    if retrieval_failures:
        findings.append({"finding": f"Semantic evidence could not be retrieved from {retrieval_failures} document(s).", "severity": "limitation", "supporting_metrics": [], "evidence": []})
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPEN_ROUTER_API_KEY")
    if api_key:
        prompt = ("Write one concise interpretation of these already-computed metrics. "
                  "Do not introduce numbers, facts, document claims, or causal explanations not present here. "
                  f"Metrics: {state['statistics']}")
        try:
            response = ChatOpenRouter(model="openrouter/auto", api_key=api_key, temperature=0.2).invoke(prompt)
            interpretation = str(response.content).strip()
            if interpretation:
                findings.append({"finding": interpretation[:700], "severity": "interpretation", "supporting_metrics": [item["metric"] for item in state["statistics"]], "evidence": []})
        except Exception:
            findings.append({"finding": "LLM interpretation was unavailable; this report contains deterministic metrics and retrieval results only.", "severity": "limitation", "supporting_metrics": [], "evidence": []})
    return {"findings": findings}


def _build_charts(state: ReportState) -> ReportState:
    datasets = (state.get("content_analysis") or {}).get("datasets") or []
    return {"charts": build_dataset_charts(datasets) + build_chart_data(state["statistics"])}


def _compose_report(state: ReportState) -> ReportState:
    title = state["analysis_plan"]["title"]
    summary = state["findings"][0]["finding"]
    kpis = build_kpis(state["statistics"])
    metric_lines = [f"{kpi['label']}: {format_kpi(kpi)}" for kpi in kpis]
    report = {"title": title, "summary": summary, "sections": [
        {"title": "Analytical findings", "content": " ".join(item["finding"] for item in state["findings"])},
        {"title": "Computed metrics", "content": "; ".join(metric_lines) or "No numeric metadata was available."},
    ], "findings": state["findings"], "kpis": kpis, "charts": state["charts"],
        "sources": [{"document_id": item["document_id"], "filename": item["filename"]} for item in state["documents"]],
        "limitations": "Metrics are calculated only from indexed upload metadata. Content-derived claims require retrievable document text."}
    return {"report": report}


def _generate_file(state: ReportState) -> ReportState:
    report_id = state["request"]["report_id"]
    path = Path(__file__).resolve().parent.parent / "storage" / "reports" / f"{report_id}.pdf"
    generate_pdf(state["report"], path)
    return {"report_path": str(path)}


_builder = StateGraph(ReportState)
for name, fn in [("resolve_documents", _resolve_documents), ("load_document_content", _load_document_content), ("analyse_document_content", _analyse_document_content), ("execute_content_analytics", _execute_content_analytics), ("build_chart_data", _build_charts), ("compose_content_report", _compose_content_report), ("generate_report_file", _generate_file)]:
    _builder.add_node(name, fn)
_builder.add_edge(START, "resolve_documents")
for left, right in zip(["resolve_documents", "load_document_content", "analyse_document_content", "execute_content_analytics", "build_chart_data", "compose_content_report"], ["load_document_content", "analyse_document_content", "execute_content_analytics", "build_chart_data", "compose_content_report", "generate_report_file"]):
    _builder.add_edge(left, right)
_builder.add_edge("generate_report_file", END)
report_graph = _builder.compile()


def generate_report(request: dict[str, Any]) -> dict[str, Any]:
    """Synchronous worker entry point; API runs this outside its event loop."""
    result = report_graph.invoke({"request": request})
    return {**result["report"], "report_path": result["report_path"]}
