"""Per-batch Vision JSON records and the page lookup citations use."""
import base64
import json

from agents import scanned_rag as module
from ingestion.vision_extract import BatchResult, ExtractedPage

DOCUMENT_ID = "0123456789abcdef"


def _batch(numbers, model="gemini-test"):
    pages = {n: ExtractedPage(page_number=n, section_heading=f"H{n}", narrative_text=f"text {n}") for n in numbers}
    images = {n: (f"png-{n}".encode(), "image/png") for n in numbers}
    return BatchResult(list(numbers), pages, images, model)


def test_batch_record_holds_extraction_and_base64_of_sent_images(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DOCUMENT_ROOT", tmp_path)
    rag = module.ScannedDocumentRAG()
    paths = rag._paths(DOCUMENT_ID)
    rag._write_batch_record(DOCUMENT_ID, paths, _batch([1, 2]))
    rag._write_batch_record(DOCUMENT_ID, paths, _batch([3]))  # a resumed upload adds, never replaces

    record = json.loads((paths["batches"] / "batch_0001-0002.json").read_text())
    assert record["model"] == "gemini-test" and record["page_numbers"] == [1, 2]
    assert base64.b64decode(record["pages"][1]["image_base64"]) == b"png-2"
    assert json.loads((paths["batches"] / "index.json").read_text()) == {
        "1": "batch_0001-0002.json", "2": "batch_0001-0002.json", "3": "batch_0003-0003.json"}

    page = rag.page_record(DOCUMENT_ID, 2)
    assert page["batch_id"] == "batch_0001-0002" and page["narrative_text"] == "text 2"
    assert rag.page_image_data_url(DOCUMENT_ID, 3) == "data:image/png;base64," + base64.b64encode(b"png-3").decode()


def test_page_record_falls_back_to_rendered_page_for_older_documents(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "DOCUMENT_ROOT", tmp_path)
    rag = module.ScannedDocumentRAG()
    images = rag._paths(DOCUMENT_ID)["images"]
    images.mkdir(parents=True)
    (images / "page_1.png").write_bytes(b"one")
    (images / "page_10.png").write_bytes(b"ten")
    assert base64.b64decode(rag.page_record(DOCUMENT_ID, 1)["image_base64"]) == b"one"  # not page_10
    assert rag.page_record(DOCUMENT_ID, 2) is None
