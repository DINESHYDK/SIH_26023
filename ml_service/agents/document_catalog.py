"""Small, durable document metadata catalog shared by ingestion and reports."""
from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from agents.typed_rag import PROJECT_ROOT

CATALOG_PATH = PROJECT_ROOT / "storage" / "document_metadata.json"
_lock = Lock()


def _read() -> dict[str, dict[str, Any]]:
    if not CATALOG_PATH.exists():
        return {}
    try:
        data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write(data: dict[str, dict[str, Any]]) -> None:
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CATALOG_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    temporary.replace(CATALOG_PATH)


def record_document(result: dict[str, Any]) -> dict[str, Any]:
    """Upsert only stable upload metadata; content remains in its own store."""
    document_id = result["document_id"]
    with _lock:
        catalog = _read()
        existing = catalog.get(document_id, {})
        catalog[document_id] = {
            **existing,
            "document_id": document_id,
            "filename": result.get("filename", existing.get("filename", document_id)),
            "document_type": result.get("document_type", existing.get("document_type", "typed")),
            "processing_status": "indexed",
            "upload_date": existing.get("upload_date") or result.get("upload_date") or datetime.now(timezone.utc).isoformat(),
            "storage_location": result.get("storage_location", existing.get("storage_location")),
            "page_count": result.get("pages", existing.get("page_count")),
            "chunk_count": result.get("chunks", existing.get("chunk_count")),
        }
        _write(catalog)
        return catalog[document_id]


def get_documents(document_ids: list[str]) -> list[dict[str, Any]]:
    catalog = _read()
    for document_id in document_ids:
        if document_id not in catalog:
            _hydrate_legacy_document(document_id)
    catalog = _read()
    missing = [item for item in document_ids if item not in catalog]
    if missing:
        raise FileNotFoundError("Unknown document ID(s): " + ", ".join(missing))
    return [catalog[item] for item in document_ids]


def get_documents_in_range(date_from: date, date_to: date) -> list[dict[str, Any]]:
    """Inclusive calendar-day range, evaluated without any semantic retrieval.

    Days are the server's local calendar days, not UTC: an upload at 04:28
    IST on the 26th is 22:58 UTC on the 25th and must still count as the 26th.
    """
    start = datetime.combine(date_from, time.min).astimezone()
    end = datetime.combine(date_to, time.max).astimezone()
    # Older indexed uploads predate the catalog. Their source PDF timestamp is
    # the best available deterministic upload proxy and is recorded once.
    for kind in ("typed", "scanned"):
        root = PROJECT_ROOT / "storage" / f"{kind}_documents"
        if root.exists():
            for child in root.iterdir():
                if child.is_dir():
                    _hydrate_legacy_document(child.name)
    results = []
    for document in _read().values():
        try:
            uploaded = datetime.fromisoformat(document["upload_date"].replace("Z", "+00:00"))
            uploaded = uploaded if uploaded.tzinfo else uploaded.replace(tzinfo=timezone.utc)
        except (KeyError, ValueError):
            continue
        if start <= uploaded <= end:
            results.append(document)
    return sorted(results, key=lambda item: item["upload_date"])


def _hydrate_legacy_document(document_id: str) -> None:
    """Make pre-catalog indexes selectable without semantic lookup."""
    catalog = _read()
    if document_id in catalog:
        return
    for document_type in ("typed", "scanned"):
        root = PROJECT_ROOT / "storage" / f"{document_type}_documents" / document_id
        pdf = root / "source.pdf"
        if not pdf.exists():
            continue
        index = root / ("vectors.faiss" if document_type == "typed" else "index.pkl")
        chunks = root / ("chunks.pkl" if document_type == "typed" else "structured_store.db")
        if not (index.exists() and chunks.exists()):
            continue
        uploaded = datetime.fromtimestamp(pdf.stat().st_mtime, tz=timezone.utc).isoformat()
        record_document({"document_id": document_id, "filename": pdf.name, "document_type": document_type,
                         "pages": None, "storage_location": str(root), "status": "indexed", "upload_date": uploaded})
        return
