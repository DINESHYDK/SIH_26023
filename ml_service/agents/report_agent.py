"""LangGraph workflow for grounded, asynchronous analytical reports."""
from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
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
    ids = list(dict.fromkeys(request.get("file_ids") or []))
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
        # Globbed files come back as page_1, page_10, page_2...: restore reading order.
        pages.sort(key=lambda page: page["page"] if isinstance(page["page"], int) else 0)
        documents.append({"document_id": document["document_id"], "filename": document["filename"], "pages": pages})
    return {"document_contents": documents}


def _content_model() -> ChatOpenRouter:
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPEN_ROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required for content-based report generation")
    return ChatOpenRouter(model=os.getenv("OPENROUTER_MODEL", "openrouter/auto"), api_key=api_key, temperature=0.1)


# Each document is analysed in its own LLM call with its own budget, so one
# long document can no longer crowd every other selected document out of the
# prompt (a 98k-char MoU used to consume the whole shared 50k budget).
DOCUMENT_CHAR_BUDGET = int(os.getenv("REPORT_DOCUMENT_CHARS", "60000"))
MAX_PARALLEL_ANALYSES = int(os.getenv("REPORT_PARALLEL_ANALYSES", "3"))

_ROMAN = {"1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v", "6": "vi", "7": "vii", "8": "viii", "9": "ix", "10": "x"}
_STOPWORDS = {"the", "and", "for", "from", "with", "give", "make", "show", "some", "generate", "report", "graph",
              "chart", "visual", "representation", "against", "into", "this", "that", "please", "all", "each"}


def _terms(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    terms = {word for word in words if (len(word) > 2 or word.isdigit()) and word not in _STOPWORDS}
    # "Annex 2" in a request must match "Annex-II" in the document.
    return terms | {_ROMAN[word] for word in words if word in _ROMAN}


def _select_pages(pages: list[dict[str, Any]], instruction: str, budget: int) -> list[dict[str, Any]]:
    """All pages if they fit; otherwise the pages most relevant to the
    instruction (distinct query terms matched), kept in document order."""
    if sum(len(page["text"]) for page in pages) <= budget:
        return pages
    wanted = _terms(instruction)
    scores = [len(wanted & set(re.findall(r"[a-z0-9]+", page["text"].lower()))) for page in pages]
    chosen, used = [], 0
    for index in sorted(range(len(pages)), key=lambda i: (-scores[i], i)):
        size = len(pages[index]["text"])
        if used + size <= budget:
            chosen.append(index)
            used += size
    if not chosen:  # a single page larger than the budget: send its start
        return [{**pages[0], "text": pages[0]["text"][:budget]}]
    return [pages[index] for index in sorted(chosen)]


def _invoke_json(prompt: str, schema: type[BaseModel]) -> dict[str, Any]:
    errors = []
    for attempt in range(2):
        try:
            response = _content_model().invoke(prompt if attempt == 0 else
                                               prompt + "\n\nYour previous reply was not a valid JSON object. Reply with ONLY the JSON object.")
            parsed = _parse_json_object(str(response.content))
            model = schema.model_validate(parsed) if hasattr(schema, "model_validate") else schema.parse_obj(parsed)
            return model.model_dump() if hasattr(model, "model_dump") else model.dict()
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError(" | ".join(errors))


def _analyse_one(document: dict[str, Any], instruction: str, others: list[str]) -> dict[str, Any]:
    pages = _select_pages(document["pages"], instruction, DOCUMENT_CHAR_BUDGET)
    context = "".join(f"[{document['document_id']} p{page['page']}] {page['text']}\n" for page in pages)
    scope = ""
    if others:
        scope = (f"This is one of several documents in the report (the others: {', '.join(others)}). "
                 "The request may be about those documents too: answer only the parts this document "
                 "contains, and do NOT report the absence of data that belongs to another document "
                 "as a finding or limitation.\n")
    prompt = f'''Analyse only this document ({document['filename']}) for the user's request: {instruction}
{scope}Return JSON only: {{"title":"...","executive_summary":"...","findings":["..."],"extracted_facts":["..."],"grade_records":[{{"subject":"...","marks_obtained":number-or-null,"maximum_marks":number-or-null,"grade":"..."-or-null,"page":number}}],"datasets":[{{"title":"...","chart_type":"bar"|"line","x_label":"...","y_label":"...","series":["..."],"rows":[{{"label":"...","values":[number-or-null],"page":number}}]}}],"limitations":["..."]}}.
For a gradesheet, extract every explicit subject/marks/maximum/grade row. Do not calculate or invent values. Every fact and finding must cite [document_id pN]. Use null for unclear cells.
"datasets" holds the numeric tables to chart. Whenever the request asks for a graph, chart, trend or comparison, or the document has a numeric table (per period, per item, per category), add a dataset: one row per x-axis value in document order, "values" in the same order as "series" (e.g. series ["SGPA","CGPA"], one row per semester). Copy numbers exactly as printed; never calculate them. Use "line" for values over time/periods, "bar" otherwise. Put series with very different magnitudes in separate datasets.
Section names may use roman numerals: "Annex 2" means "Annex-II", "Part A" is distinct from "Annexure-B".
Reply with the JSON object only: no prose, no markdown.
Document content:
{context}'''
    analysis = _invoke_json(prompt, ContentAnalysis)
    if len(pages) < len(document["pages"]):
        shown = ", ".join(str(page["page"]) for page in pages)
        analysis["limitations"].append(
            f"{document['filename']} is too long to analyse whole; only the pages most relevant to the request were read ({shown}).")
    for dataset in analysis["datasets"]:
        dataset["source"] = document["filename"]
    for record in analysis["grade_records"]:
        record["document_id"] = document["document_id"]
    return {"document_id": document["document_id"], "filename": document["filename"], **analysis}


class ReportHeading(BaseModel):
    title: str
    executive_summary: str


def _analyse_document_content(state: ReportState) -> ReportState:
    """Analyse each selected document separately (in parallel), then merge."""
    documents = state["document_contents"]
    instruction = state["request"].get("instruction") or "Provide a factual analysis of these documents."
    names = [document["filename"] for document in documents]
    results: list[dict[str, Any]] = []
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=max(1, min(MAX_PARALLEL_ANALYSES, len(documents)))) as pool:
        futures = [pool.submit(_analyse_one, document, instruction, [name for name in names if name != document["filename"]])
                   for document in documents]
        for document, future in zip(documents, futures):
            try:
                results.append(future.result())
            except Exception as exc:
                failures.append(f"{document['filename']}: {exc}")
    if not results:
        raise RuntimeError("Content analysis failed: " + " | ".join(failures))

    merged: dict[str, Any] = {key: [item for result in results for item in result[key]]
                              for key in ("findings", "extracted_facts", "grade_records", "datasets", "limitations")}
    merged["limitations"] += [f"Analysis of {failure}" for failure in failures]
    merged["per_document"] = [{key: result[key] for key in ("document_id", "filename", "title", "executive_summary")}
                              for result in results]
    if len(results) == 1:
        merged.update(title=results[0]["title"], executive_summary=results[0]["executive_summary"])
    else:
        summaries = "\n".join(f"- {result['filename']}: {result['executive_summary']}" for result in results)
        try:
            heading = _invoke_json(
                f"Write a report title and a 2-4 sentence executive summary covering all of these per-document "
                f"summaries for the request: {instruction}\nUse only facts stated below and keep their citations.\n"
                f'Return JSON only: {{"title":"...","executive_summary":"..."}}\n{summaries}', ReportHeading)
        except Exception:
            heading = {"title": instruction.strip()[:120] or "Multi-document report",
                       "executive_summary": " ".join(result["executive_summary"] for result in results)}
        merged.update(heading)
    return {"content_analysis": merged}


def _execute_content_analytics(state: ReportState) -> ReportState:
    return {"statistics": calculate_content_analytics(state["content_analysis"]["grade_records"])}


def _compose_content_report(state: ReportState) -> ReportState:
    analysis = state["content_analysis"]
    kpis = build_kpis(state["statistics"])
    metrics = [f"{kpi['label']}: {format_kpi(kpi)}" for kpi in kpis]
    per_document = analysis.get("per_document") or []
    sections = []
    if len(per_document) > 1:
        sections += [{"title": item["filename"], "content": item["executive_summary"]} for item in per_document]
    sections += [
        {"title": "Analytical findings", "content": " ".join(analysis["findings"]) or "No grounded findings were returned."},
        {"title": "Document-derived facts", "content": " ".join(analysis["extracted_facts"]) or "No additional facts were extracted."},
    ]
    if metrics:
        sections.append({"title": "Computed grade metrics", "content": "; ".join(metrics)})
    report = {"title": analysis["title"], "summary": analysis["executive_summary"], "sections": sections,
              "findings": [{"finding": finding, "severity": "content", "supporting_metrics": [], "evidence": []} for finding in analysis["findings"]],
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
