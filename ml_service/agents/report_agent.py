"""LangGraph workflow for grounded, asynchronous analytical reports."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, TypedDict

from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel

from agents.document_catalog import get_documents, get_documents_in_range
from agents.scanned_rag import scanned_document_rag
from agents.typed_rag import typed_document_rag
from services.analytics_service import calculate_document_analytics
from services.chart_service import build_chart_data
from services.report_generator import generate_pdf


class ReportState(TypedDict, total=False):
    request: dict[str, Any]
    document_ids: list[str]
    documents: list[dict[str, Any]]
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
    return {"charts": build_chart_data(state["statistics"])}


def _compose_report(state: ReportState) -> ReportState:
    title = state["analysis_plan"]["title"]
    summary = state["findings"][0]["finding"]
    metric_lines = []
    for metric in state["statistics"]:
        if "value" in metric:
            metric_lines.append(f"{metric['metric']}: {metric['value']}")
    report = {"title": title, "summary": summary, "sections": [
        {"title": "Analytical findings", "content": " ".join(item["finding"] for item in state["findings"])},
        {"title": "Computed metrics", "content": "; ".join(metric_lines) or "No numeric metadata was available."},
    ], "findings": state["findings"], "charts": state["charts"],
        "sources": [{"document_id": item["document_id"], "filename": item["filename"]} for item in state["documents"]],
        "limitations": "Metrics are calculated only from indexed upload metadata. Content-derived claims require retrievable document text."}
    return {"report": report}


def _generate_file(state: ReportState) -> ReportState:
    report_id = state["request"]["report_id"]
    path = Path(__file__).resolve().parent.parent / "storage" / "reports" / f"{report_id}.pdf"
    generate_pdf(state["report"], path)
    return {"report_path": str(path)}


_builder = StateGraph(ReportState)
for name, fn in [("resolve_documents", _resolve_documents), ("plan_analysis", _plan_analysis), ("execute_analytics", _execute_analytics), ("retrieve_supporting_evidence", _retrieve_evidence), ("interpret_findings", _interpret_findings), ("build_chart_data", _build_charts), ("compose_report", _compose_report), ("generate_report_file", _generate_file)]:
    _builder.add_node(name, fn)
_builder.add_edge(START, "resolve_documents")
for left, right in zip(["resolve_documents", "plan_analysis", "execute_analytics", "retrieve_supporting_evidence", "interpret_findings", "build_chart_data", "compose_report"], ["plan_analysis", "execute_analytics", "retrieve_supporting_evidence", "interpret_findings", "build_chart_data", "compose_report", "generate_report_file"]):
    _builder.add_edge(left, right)
_builder.add_edge("generate_report_file", END)
report_graph = _builder.compile()


def generate_report(request: dict[str, Any]) -> dict[str, Any]:
    """Synchronous worker entry point; API runs this outside its event loop."""
    result = report_graph.invoke({"request": request})
    return {**result["report"], "report_path": result["report_path"]}
