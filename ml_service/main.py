"""
CMPDI GeoReport AI — ML Service
FastAPI application exposing document processing and query endpoints.
Problem Statement ID: 26023 | Ministry of Coal / CIL (CMPDI)
"""

import base64
import json
import os
import uuid
from datetime import date
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
from pydantic import BaseModel, root_validator
from typing import Optional, Union
from agents.document_ingestion import ingest_pdf, is_typed_pdf
from agents.gemini_rate_limiter import GeminiRateLimitExceeded
from agents.query_agent import prepare_query, stream_prepared_answer
from agents.report_agent import generate_report
from agents.scanned_rag import scanned_document_rag
# Importable once agents.scanned_rag has put the OCR pipeline on sys.path.
from ingestion.vision_extract import DailyQuotaExceeded, ModelsUnavailable
import asyncio

app = FastAPI(
    title="CMPDI GeoReport AI — ML Service",
    description="Gemini Multi-Agent Engine for geological report generation, topic identification, and parliamentary Q&A.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Citations"],
)


def _worker_limit(setting: str, default: int) -> int:
    """Read a positive per-process ingestion concurrency limit."""
    try:
        return max(1, int(os.getenv(setting, str(default))))
    except ValueError:
        return default


# Typed PDFs are local CPU work, while scanned PDFs make Vision OCR requests.
# Separate limits prevent a scan-heavy batch from exhausting API capacity.
typed_ingestion_slots = asyncio.Semaphore(_worker_limit("MAX_TYPED_INGESTIONS", 3))
scanned_ingestion_slots = asyncio.Semaphore(_worker_limit("MAX_SCANNED_INGESTIONS", 1))


# ── Request / Response Models ──────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str
    # Omit context_doc to search every indexed document, or provide one ID,
    # a comma-separated string, or an array of IDs to limit the search.
    context_doc: Optional[Union[str, list[str]]] = None


class Citation(BaseModel):
    page: int
    source: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation] = []


class ReportRequest(BaseModel):
    file_ids: Optional[list[str]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    instruction: Optional[str] = None

    @root_validator(skip_on_failure=True)
    def validate_selection(cls, values):
        file_ids, date_from, date_to = values.get("file_ids"), values.get("date_from"), values.get("date_to")
        # Exactly one selection mode: explicit documents, or every document
        # uploaded in a date range. Mixing them used to silently drop the range.
        if file_ids and (date_from or date_to):
            raise ValueError("Provide either file_ids or date_from/date_to, not both")
        if not file_ids and not (date_from and date_to):
            raise ValueError("Provide file_ids or both date_from and date_to")
        if (date_from is None) != (date_to is None):
            raise ValueError("date_from and date_to must be supplied together")
        if date_from and date_to and date_from > date_to:
            raise ValueError("date_from must be on or before date_to")
        return values


report_jobs: dict[str, dict] = {}


def _run_report_job(report_id: str, request: dict) -> None:
    try:
        report = generate_report({**request, "report_id": report_id})
        report_jobs[report_id] = {"report_id": report_id, "status": "completed", "report": {**report, "report_url": f"/reports/{report_id}/download"}}
    except Exception as exc:
        report_jobs[report_id] = {"report_id": report_id, "status": "failed", "error": str(exc)}


# ── Endpoints ──────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "CMPDI GeoReport ML Service"}


@app.post("/process-document")
async def process_documents(
    file: Optional[UploadFile] = File(None),
    files: list[UploadFile] = File(default=[]),
):
    """Ingest one or more PDFs with safe, bounded parallelism.

    Submit repeated ``files`` form fields for a batch. The legacy single
    ``file`` form field remains supported. Typed and scanned PDFs use separate
    worker pools so OCR cannot consume all available ingestion capacity.
    """
    uploads = ([file] if file is not None else []) + files
    if not uploads:
        raise HTTPException(status_code=400, detail="No files provided")
    if any(not upload.filename for upload in uploads):
        raise HTTPException(status_code=400, detail="Every uploaded file must have a filename")

    async def ingest_upload(upload: UploadFile) -> dict:
        try:
            content = await upload.read()
            is_typed = await asyncio.to_thread(is_typed_pdf, content)
            slots = typed_ingestion_slots if is_typed else scanned_ingestion_slots
            # Limit each category, but allow a typed PDF and a scanned PDF to
            # progress together. Ingestion itself remains off the event loop.
            async with slots:
                result = await asyncio.to_thread(ingest_pdf, upload.filename, content)
            return {"filename": upload.filename, "status": "processed", "result": result}
        except (GeminiRateLimitExceeded, DailyQuotaExceeded) as exc:
            return {"filename": upload.filename, "status": "rate_limited", "error": str(exc)}
        except ModelsUnavailable as exc:
            return {"filename": upload.filename, "status": "unavailable", "error": str(exc)}
        except ValueError as exc:
            return {"filename": upload.filename, "status": "failed", "error": str(exc)}
        except Exception as exc:
            return {"filename": upload.filename, "status": "failed", "error": str(exc)}

    # gather preserves the upload order in its results while workers run in
    # parallel up to the limits above.
    results = await asyncio.gather(*(ingest_upload(upload) for upload in uploads))

    # Retain the established successful single-upload response for existing clients.
    if len(uploads) == 1 and results[0]["status"] == "processed":
        return results[0]["result"]
    if len(uploads) == 1 and results[0]["status"] == "rate_limited":
        raise HTTPException(status_code=429, detail=results[0]["error"], headers={"Retry-After": "3600"})
    if len(uploads) == 1 and results[0]["status"] == "unavailable":
        # Extracted pages are cached, so a retry after this resumes, not restarts.
        raise HTTPException(status_code=503, detail=results[0]["error"], headers={"Retry-After": "120"})
    if len(uploads) == 1:
        raise HTTPException(status_code=400, detail=results[0]["error"])

    return {
        "total": len(uploads),
        "processed": sum(item["status"] == "processed" for item in results),
        "failed": sum(item["status"] != "processed" for item in results),
        "documents": results,
    }

#--> This endpoint gives streaming responses to facilitate good user experience
@app.post("/query",response_class=StreamingResponse)#, response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Accepts a query and optional context document identifier.
    Returns an answer with verifiable source citations.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Retrieval runs before streaming so its citations can go out as the
    # X-Citations header (JSON list; scanned pages carry a page_url whose
    # JSON holds the Base64 page image). The body stays plain text.
    try:
        prepared = await prepare_query(request.query, request.context_doc)
    except Exception as exc:
        message = f"Query error: {exc}"
        return StreamingResponse(iter([message]), media_type="text/plain")

    async def generate():
        try:
            async for chunk in stream_prepared_answer(prepared):
                yield chunk
        except Exception as exc:
            yield f"Query error: {exc}"

    headers = {"X-Citations": json.dumps(prepared["citations"], ensure_ascii=True, separators=(",", ":"))}
    return StreamingResponse(generate(), media_type="text/plain", headers=headers)


def _page_record(document_id: str, page_number: int) -> dict:
    try:
        record = scanned_document_rag.page_record(document_id, page_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not record:
        raise HTTPException(status_code=404, detail="Page image not found for this document")
    return record


@app.get("/documents/{document_id}/pages/{page_number}")
async def get_document_page(document_id: str, page_number: int):
    """Extraction + Base64 image of one scanned page (from its Vision batch JSON)."""
    return await asyncio.to_thread(_page_record, document_id, page_number)


@app.get("/documents/{document_id}/pages/{page_number}/image")
async def get_document_page_image(document_id: str, page_number: int):
    """The same page image as raw bytes, usable directly as an <img> src."""
    record = await asyncio.to_thread(_page_record, document_id, page_number)
    return Response(base64.b64decode(record["image_base64"]), media_type=record["image_mime_type"],
                    headers={"Cache-Control": "private, max-age=86400"})


@app.post("/generate-report", status_code=202)
async def create_report(request: ReportRequest, background_tasks: BackgroundTasks):
    """Queue a report; document selection and metrics run deterministically in its graph."""
    report_id = f"rpt_{uuid.uuid4().hex[:12]}"
    payload = request.dict()
    payload["date_from"] = payload["date_from"].isoformat() if payload["date_from"] else None
    payload["date_to"] = payload["date_to"].isoformat() if payload["date_to"] else None
    # Convert dates back in the worker so the graph stays usable from Python too.
    if payload["date_from"]:
        payload["date_from"] = date.fromisoformat(payload["date_from"])
        payload["date_to"] = date.fromisoformat(payload["date_to"])
    report_jobs[report_id] = {"report_id": report_id, "status": "processing"}
    background_tasks.add_task(_run_report_job, report_id, payload)
    return report_jobs[report_id]


@app.get("/reports/{report_id}")
async def get_report(report_id: str):
    job = report_jobs.get(report_id)
    if not job:
        raise HTTPException(status_code=404, detail="Report not found")
    return job


@app.get("/reports/{report_id}/download")
async def download_report(report_id: str):
    job = report_jobs.get(report_id)
    if not job or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Completed report not found")
    path = job["report"]["report_path"]
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report file is unavailable")
    return FileResponse(path, media_type="application/pdf", filename=f"{report_id}.pdf")

    # return QueryResponse(
    #     answer=(
    #         "Based on the BCCL Quarterly Geological Report (Q3 FY2025-26), "
    #         "the total coking coal reserves inferred across Seams X, XI, and XII "
    #         "in the Jharia Coalfield stand at approximately 184.5 Million Tonnes. "
    #         "Pit-wise production analysis indicates Pit 1 exceeded its target by 4.3%, "
    #         "while Pit 2 experienced a 3.6% shortfall attributed to monsoon-related "
    #         "water ingress."
    #     ),
    #     citations=[
    #         Citation(page=14, source="BCCL Quarterly Geological Report Q3"),
    #         Citation(page=28, source="BCCL Production Returns FY2025-26"),
    #     ],
    # )
