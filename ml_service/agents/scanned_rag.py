"""Bridge the scanned-PDF RAG pipeline into the FastAPI application."""
from __future__ import annotations

import base64
import functools
import hashlib
import json
import sqlite3
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PIPELINE_ROOT = PROJECT_ROOT / "cil_rag_pipeline_updated" / "cil_rag"
DOCUMENT_ROOT = PROJECT_ROOT / "storage" / "scanned_documents"


def _require_local_pipeline() -> None:
    """Do not silently import an OCR pipeline left over in another checkout."""
    required_files = (
        PIPELINE_ROOT / "ingestion" / "ingest_pipeline.py",
        PIPELINE_ROOT / "ingestion" / "vision_extract.py",
        PIPELINE_ROOT / "ingestion" / "index_builder.py",
        PIPELINE_ROOT / "query" / "query_pipeline.py",
    )
    if not all(path.is_file() for path in required_files):
        raise RuntimeError(
            "The local scanned-PDF pipeline is missing. Restore "
            f"{PIPELINE_ROOT} from the source project before processing scanned PDFs."
        )

# The supplied pipeline uses imports such as ``from ingestion...``. Add its
# root once rather than changing the friend's source layout or demo scripts.
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))


class ScannedDocumentRAG:
    """Owns persisted indexes and databases for uploaded scanned PDFs."""

    def _paths(self, document_id: str) -> dict[str, Path]:
        root = DOCUMENT_ROOT / document_id
        return {"root": root, "pdf": root / "source.pdf", "images": root / "page_images",
                "cache": root / "extracted_pages", "batches": root / "extracted_pages" / "batches",
                "database": root / "structured_store.db", "index": root / "index.pkl"}

    def _write_batch_record(self, document_id: str, paths: dict[str, Path], batch) -> None:
        """Persist one Vision API call as JSON: its extraction plus the Base64
        of exactly the page images that were sent, so citations can show them."""
        paths["batches"].mkdir(parents=True, exist_ok=True)
        numbers = sorted(batch.pages)
        batch_id = f"batch_{numbers[0]:04d}-{numbers[-1]:04d}"
        record = {
            "document_id": document_id, "batch_id": batch_id, "model": batch.model,
            "created_at": datetime.now(timezone.utc).isoformat(), "page_numbers": numbers,
            "pages": [{**asdict(batch.pages[number]), "image_mime_type": batch.images[number][1],
                       "image_base64": base64.b64encode(batch.images[number][0]).decode("ascii")}
                      for number in numbers],
        }
        (paths["batches"] / f"{batch_id}.json").write_text(json.dumps(record), encoding="utf-8")
        # page -> batch file, merged so a resumed upload keeps earlier batches.
        index_file = paths["batches"] / "index.json"
        try:
            index = json.loads(index_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            index = {}
        index.update({str(number): f"{batch_id}.json" for number in numbers})
        index_file.write_text(json.dumps(index, sort_keys=True), encoding="utf-8")

    def _persist_page_image_records(self, paths: dict[str, Path], page_numbers: list[int]) -> None:
        """Persist Vision-page JSON with Base64 PNGs, outside retrieval chunks."""
        import fitz
        paths["images"].mkdir(parents=True, exist_ok=True)
        paths["cache"].mkdir(parents=True, exist_ok=True)
        manifest = []
        with fitz.open(paths["pdf"]) as pdf:
            for number in page_numbers:
                # Exact name: a "*1*.png" glob would hand page 1 page_10's image.
                image_path = paths["images"] / f"page_{number}.png"
                if not image_path.exists():
                    image_path.write_bytes(pdf[number - 1].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).tobytes("png"))
                record = {"page_number": number, "image_mime_type": "image/png", "image_base64": base64.b64encode(image_path.read_bytes()).decode("ascii")}
                cache_file = paths["cache"] / f"page_{number}.json"
                if cache_file.exists():
                    try:
                        existing = json.loads(cache_file.read_text(encoding="utf-8"))
                        if isinstance(existing, dict):
                            record = {**existing, **record}
                    except (OSError, json.JSONDecodeError):
                        pass
                cache_file.write_text(json.dumps(record), encoding="utf-8")
                manifest.append(record)
        (paths["cache"] / "pages.json").write_text(json.dumps(manifest), encoding="utf-8")

    def ingest(self, filename: str, content: bytes) -> dict:
        """Extract a scanned PDF with Gemini Vision and persist its retrieval index."""
        if not content:
            raise ValueError("The uploaded file is empty")
        if not filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF uploads are supported")
        _require_local_pipeline()
        # Content-derived IDs make repeated uploads idempotent and avoid trusting
        # a client-provided filename as a filesystem location.
        document_id = hashlib.sha256(content).hexdigest()[:16]
        paths = self._paths(document_id)
        paths["root"].mkdir(parents=True, exist_ok=True)
        if not paths["pdf"].exists():
            paths["pdf"].write_bytes(content)

        # ``fitz`` is the import name guaranteed by the pinned PyMuPDF
        # dependency. Using it consistently avoids a scan-only import error.
        import fitz
        from ingestion.ingest_pipeline import run_ingestion
        from ingestion.vision_extract import extract_pages
        with fitz.open(paths["pdf"]) as pdf:
            page_numbers = list(range(1, len(pdf) + 1))
        if not page_numbers:
            raise ValueError("The PDF has no pages")

        index, connection = run_ingestion(
            str(paths["pdf"]), page_numbers=page_numbers,
            batch_extract_fn=functools.partial(
                extract_pages, on_batch=functools.partial(self._write_batch_record, document_id, paths)),
            db_path=str(paths["database"]), image_dir=str(paths["images"]),
            cache_dir=str(paths["cache"]),
        )
        try:
            index.save(str(paths["index"]))
        finally:
            connection.close()
        self._persist_page_image_records(paths, page_numbers)
        return {"document_id": document_id, "filename": filename, "pages": len(page_numbers),
                "chunks": len(index.chunks), "storage_location": str(paths["root"]), "status": "indexed"}

    def answer(self, question: str, document_id: str) -> dict:
        """Retrieve only from the requested document, then generate a cited answer."""
        retrieved = self.retrieve(question, document_id)
        if retrieved["route"] == "structured":
            return {"answer": f"Matching table: {retrieved['caption']}\n" + "\n".join(str(row) for row in retrieved["rows"]),
                    "citations": [{"page": retrieved["page_number"], "source": retrieved["matched_table"]}]}

        from query.answer import generate_cited_answer
        generated = generate_cited_answer(question, retrieved["results"])
        citations = [{"page": chunk.page_number, "source": chunk.chunk_id}
                     for chunk, _score in retrieved["results"]]
        return {"answer": generated["answer"], "citations": citations,
                "invalid_citations": generated["invalid_citations"]}

    def retrieve(self, question: str, document_id: str, k: int = 5) -> dict:
        """Return normalized retrieval data for the LangGraph query agent."""
        if not document_id:
            raise ValueError("context_doc is required; first upload a document")
        if len(document_id) != 16 or any(c not in "0123456789abcdef" for c in document_id):
            raise ValueError("context_doc is not a valid document ID")
        paths = self._paths(document_id)
        if not paths["index"].exists() or not paths["database"].exists():
            raise FileNotFoundError("Document is not indexed. Upload it before querying.")

        from ingestion.index_builder import HybridIndex
        from query.query_pipeline import run_query
        index = HybridIndex.load(str(paths["index"]))
        connection = sqlite3.connect(paths["database"])
        try:
            # The optional cross-encoder lazily downloads model weights on its
            # first use, which can make an otherwise local scanned-PDF query
            # hang or fail in deployed/offline environments. BM25 and table
            # retrieval are already persisted with the document, so keep this
            # path deterministic.
            result = run_query(question, index, connection, k=k, use_reranker=False)
        finally:
            connection.close()

        return result

    def page_record(self, document_id: str, page_number: int) -> dict | None:
        """A page's extraction plus its Base64 image, for citation previews.

        Prefers the batch JSON (the exact image sent to the model); falls back
        to the per-page JSON / rendered PNG for documents ingested before batch
        records existed. None when the page is unknown.
        """
        if len(document_id) != 16 or any(c not in "0123456789abcdef" for c in document_id):
            raise ValueError("document_id is not a valid document ID")
        paths = self._paths(document_id)
        try:
            batch_file = json.loads((paths["batches"] / "index.json").read_text(encoding="utf-8")).get(str(page_number))
            if batch_file:
                batch = json.loads((paths["batches"] / batch_file).read_text(encoding="utf-8"))
                page = next(item for item in batch["pages"] if item["page_number"] == page_number)
                return {"document_id": document_id, "batch_id": batch["batch_id"], **page}
        except (OSError, json.JSONDecodeError, StopIteration, KeyError):
            pass
        record: dict = {"page_number": page_number}
        try:
            record.update(json.loads((paths["cache"] / f"page_{page_number}.json").read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
        if not record.get("image_base64"):
            image_path = paths["images"] / f"page_{page_number}.png"
            if not image_path.exists():
                return None
            record.update(image_mime_type="image/png", image_base64=base64.b64encode(image_path.read_bytes()).decode("ascii"))
        return {"document_id": document_id, "batch_id": None, **record}

    def page_image_data_url(self, document_id: str, page_number: int) -> str | None:
        """Return an OCR page as a multimodal LLM input, not textual output."""
        record = self.page_record(document_id, page_number)
        if not record:
            return None
        return f"data:{record['image_mime_type']};base64,{record['image_base64']}"

    def exists(self, document_id: str) -> bool:
        paths = self._paths(document_id)
        return paths["index"].exists() and paths["database"].exists()


scanned_document_rag = ScannedDocumentRAG()
