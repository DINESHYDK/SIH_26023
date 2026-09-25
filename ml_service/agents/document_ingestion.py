"""Choose native-text or OCR ingestion for files accepted by one API endpoint."""
from __future__ import annotations

import fitz

from agents.scanned_rag import scanned_document_rag
from agents.typed_rag import typed_document_rag


def is_typed_pdf(content: bytes) -> bool:
    """Classify PDFs by native selectable text, not by their filename or metadata.

    A modest amount of extracted text on most pages identifies a born-digital
    PDF. Image-only and mostly-image PDFs follow the OCR path. Mixed PDFs are
    deliberately treated as scanned so no image-only pages are silently lost.
    """
    try:
        with fitz.open(stream=content, filetype="pdf") as pdf:
            if not pdf:
                raise ValueError("The PDF has no pages")
            page_signals = []
            for page in pdf:
                text_length = len(page.get_text("text").strip())
                page_area = page.rect.width * page.rect.height
                # Scanners commonly add an OCR text layer to a single full-page
                # image. Text length alone would incorrectly send those PDFs to
                # native extraction. A dominant raster image is a reliable
                # signal to use the Vision OCR path instead.
                image_area = 0.0
                for image in page.get_images(full=True):
                    for rect in page.get_image_rects(image[0]):
                        image_area = max(image_area, rect.width * rect.height)
                is_image_page = page_area > 0 and image_area / page_area >= 0.80
                page_signals.append((text_length, is_image_page))
    except fitz.FileDataError as exc:
        raise ValueError("The uploaded file is not a valid PDF") from exc
    # Every page must be natively readable. This deliberately routes mixed
    # PDFs through OCR as well, preventing image-only pages from being lost.
    return all(text_length >= 40 and not is_image_page
               for text_length, is_image_page in page_signals)


def ingest_pdf(filename: str, content: bytes) -> dict:
    if not filename.lower().endswith(".pdf"):
        raise ValueError("Only PDF uploads are supported")
    if is_typed_pdf(content):
        return typed_document_rag.ingest(filename, content)
    result = scanned_document_rag.ingest(filename, content)
    return {**result, "document_type": "scanned"}
