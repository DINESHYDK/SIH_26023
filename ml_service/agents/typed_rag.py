"""Typed-PDF ingestion backed by a persisted FAISS vector store."""
from __future__ import annotations

import hashlib
import os
import pickle
import re
from functools import lru_cache
from pathlib import Path

import faiss
import fitz
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOCUMENT_ROOT = PROJECT_ROOT / "storage" / "typed_documents"
EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
RRF_K = 60  # standard Reciprocal Rank Fusion constant


def _tokenize(text: str) -> list[str]:
    # Keep figures such as "2023-24" or "206.10" whole so they match as units.
    return re.findall(r"[a-z]+|\d+(?:[-./]\d+)*", text.lower())


@lru_cache(maxsize=1)
def _embedder() -> SentenceTransformer:
    """Keep the embedding model in memory rather than loading it per request."""
    return SentenceTransformer(EMBEDDING_MODEL)


def _chunk_page(text: str, page: int, size: int = 900, overlap: int = 150) -> list[dict]:
    text = " ".join(text.split())
    chunks: list[dict] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        # Prefer a sentence/word boundary so citations remain readable.
        if end < len(text):
            boundary = max(text.rfind(". ", start, end), text.rfind(" ", start, end))
            if boundary > start + size // 2:
                end = boundary + 1
        body = text[start:end].strip()
        if body:
            chunks.append({"id": f"p{page}_c{len(chunks) + 1}", "page": page, "text": body})
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


class TypedDocumentRAG:
    """Extract native PDF text and persist one FAISS index per document."""

    def _paths(self, document_id: str) -> dict[str, Path]:
        root = DOCUMENT_ROOT / document_id
        return {"root": root, "pdf": root / "source.pdf", "index": root / "vectors.faiss",
                "chunks": root / "chunks.pkl"}

    def ingest(self, filename: str, content: bytes) -> dict:
        if not content:
            raise ValueError("The uploaded file is empty")
        document_id = hashlib.sha256(content).hexdigest()[:16]
        paths = self._paths(document_id)
        paths["root"].mkdir(parents=True, exist_ok=True)
        if paths["index"].exists() and paths["chunks"].exists():
            with paths["chunks"].open("rb") as handle:
                chunks = pickle.load(handle)
            with fitz.open(paths["pdf"]) as pdf:
                page_count = len(pdf)
            return {"document_id": document_id, "filename": filename, "chunks": len(chunks),
                    "pages": page_count, "storage_location": str(paths["root"]),
                    "document_type": "typed", "status": "already_indexed"}

        paths["pdf"].write_bytes(content)
        chunks: list[dict] = []
        with fitz.open(stream=content, filetype="pdf") as pdf:
            page_count = len(pdf)
            for page_number, page in enumerate(pdf, start=1):
                chunks.extend(_chunk_page(page.get_text("text"), page_number))
        if not chunks:
            raise ValueError("No selectable text was found; this PDF should be processed as scanned")

        vectors = np.asarray(_embedder().encode([chunk["text"] for chunk in chunks],
                                                  normalize_embeddings=True), dtype="float32")
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)
        faiss.write_index(index, str(paths["index"]))
        with paths["chunks"].open("wb") as handle:
            pickle.dump(chunks, handle)
        return {"document_id": document_id, "filename": filename, "chunks": len(chunks), "pages": page_count,
                "storage_location": str(paths["root"]), "document_type": "typed", "status": "indexed"}

    def retrieve(self, question: str, document_id: str, k: int = 5) -> list[dict]:
        paths = self._paths(document_id)
        if not paths["index"].exists() or not paths["chunks"].exists():
            raise FileNotFoundError("Typed document is not indexed. Upload it before querying.")
        with paths["chunks"].open("rb") as handle:
            chunks = pickle.load(handle)
        index = faiss.read_index(str(paths["index"]))
        query_vector = np.asarray(_embedder().encode([question], normalize_embeddings=True),
                                  dtype="float32")
        _scores, positions = index.search(query_vector, len(chunks))
        vector_ranking = [int(position) for position in positions[0] if position >= 0]

        # Embeddings alone miss table rows such as "MCL 176.00 193.26 ...", so
        # fuse them with BM25 keyword ranking (same approach as the scanned
        # pipeline). Rank fusion avoids comparing BM25 and cosine score scales.
        bm25_scores = BM25Okapi([_tokenize(chunk["text"]) for chunk in chunks]).get_scores(
            _tokenize(question))
        keyword_ranking = [int(i) for i in np.argsort(bm25_scores)[::-1] if bm25_scores[i] > 0]

        fused: dict[int, float] = {}
        for ranking in (vector_ranking, keyword_ranking):
            for rank, position in enumerate(ranking):
                fused[position] = fused.get(position, 0.0) + 1.0 / (RRF_K + rank + 1)
        best = sorted(fused, key=fused.get, reverse=True)[:k]

        # 900-char chunks split tables away from their column headers, so hand
        # the model the whole page behind each match (best-ranked page first).
        pages: dict[int, float] = {}
        for position in best:
            pages.setdefault(chunks[position]["page"], fused[position])
        with fitz.open(paths["pdf"]) as pdf:
            return [{"id": f"p{page}", "page": page, "score": score,
                     "text": " ".join(pdf[page - 1].get_text("text").split())}
                    for page, score in pages.items()]

    def read_chunks(self, document_id: str) -> list[dict]:
        """Load persisted text for a report; no semantic filtering is applied."""
        paths = self._paths(document_id)
        if not paths["chunks"].exists():
            raise FileNotFoundError("Typed document is not indexed. Upload it before reporting.")
        with paths["chunks"].open("rb") as handle:
            return pickle.load(handle)

    def exists(self, document_id: str) -> bool:
        paths = self._paths(document_id)
        return paths["index"].exists() and paths["chunks"].exists()


typed_document_rag = TypedDocumentRAG()
