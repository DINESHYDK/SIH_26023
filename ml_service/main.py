"""
CMPDI GeoReport AI — ML Service
FastAPI application exposing document processing and query endpoints.
Problem Statement ID: 26023 | Ministry of Coal / CIL (CMPDI)
"""

import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Union
from agents.document_ingestion import ingest_pdf, is_typed_pdf
from agents.gemini_rate_limiter import GeminiRateLimitExceeded
from agents.query_agent import stream_document_answer
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
        except GeminiRateLimitExceeded as exc:
            return {"filename": upload.filename, "status": "rate_limited", "error": str(exc)}
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
        raise HTTPException(status_code=429, detail=results[0]["error"])
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

    async def generate():
        try:
            async for chunk in stream_document_answer(request.query, request.context_doc):
                yield chunk
        except (ValueError, FileNotFoundError) as exc:
            yield f"Query error: {exc}"
        except Exception as exc:
            yield f"Query error: {exc}"

    return StreamingResponse(generate(),media_type="text/plain")

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
