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
from agents.document_ingestion import ingest_pdf
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
async def process_document(file: UploadFile = File(...)):
    """
    Ingests a typed PDF into FAISS or a scanned PDF through vision OCR, then returns its document ID.
    Send that ID as ``context_doc`` to /query.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    try:
        # Vision OCR and indexing are CPU/network-bound; keep FastAPI's event
        # loop free so health checks and other requests still respond.
        content = await file.read()
        return await asyncio.to_thread(ingest_pdf, file.filename, content)
    except GeminiRateLimitExceeded as exc:
        # A planned quota rejection is not an ingestion failure; clients can
        # retry after the configured rolling daily window has room.
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Document ingestion failed: {exc}") from exc

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
