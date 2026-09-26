"""
Turns one ExtractedPage into a list of Chunk objects ready for embedding.

Two chunk types, matching the earlier discussion:
  - "narrative": prose split with the section heading attached as context
  - "table_row": one chunk per table row, with column headers baked into the
    sentence (not just present in a separate header row) and the table's
    caption + page heading prepended as the contextual blurb.

Because vision_extract already returns section_heading and table caption in
the same call that read the page, the "contextual enrichment" step from the
architecture discussion is mostly free here -- we don't need a second LLM
call per chunk just to generate a context blurb; we already have the heading
and caption from extraction. A second LLM call would still help for chunks
where the heading alone doesn't disambiguate (see enrich.py), but the bulk of
the "where does context loss happen" problem is solved by capturing heading +
caption at extraction time rather than after the fact.
"""
import re
from dataclasses import dataclass, field
from typing import Optional

from ingestion.vision_extract import ExtractedPage, ExtractedTable

MAX_NARRATIVE_CHUNK_CHARS = 800  # recursive-splitting fallback threshold


@dataclass
class Chunk:
    chunk_id: str
    chunk_type: str  # "narrative" | "table_row"
    text: str  # what actually gets embedded / BM25-indexed
    page_number: int
    section_heading: Optional[str]
    metadata: dict = field(default_factory=dict)


def _recursive_split(text: str, max_chars: int) -> list:
    """Fallback splitter, only used if a narrative block is too long even
    after splitting on the page's own heading boundaries. Tries paragraph
    breaks first, then sentences -- the standard recursive pattern, kept as
    a fallback rather than the primary strategy."""
    if len(text) <= max_chars:
        return [text]
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) > 1:
        chunks = []
        for p in paragraphs:
            chunks.extend(_recursive_split(p, max_chars))
        return chunks
    # single long paragraph -> split on sentence boundaries
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, current = [], ""
    for s in sentences:
        if len(current) + len(s) > max_chars and current:
            chunks.append(current.strip())
            current = s
        else:
            current += (" " if current else "") + s
    if current:
        chunks.append(current.strip())
    return chunks


def chunk_narrative(page: ExtractedPage) -> list:
    """Structure-aware: the heading is the split boundary (already given by
    extraction), recursive splitting is only the fallback within it."""
    if not page.narrative_text.strip():
        return []
    pieces = _recursive_split(page.narrative_text, MAX_NARRATIVE_CHUNK_CHARS)
    chunks = []
    for i, piece in enumerate(pieces):
        # Heading prepended as context -- this is the cheap half of
        # "contextual retrieval": free because extraction already gave us
        # the heading, no extra LLM call needed for this part.
        context_prefix = f"[{page.section_heading}] " if page.section_heading else ""
        chunks.append(Chunk(
            chunk_id=f"p{page.page_number}_narrative_{i}",
            chunk_type="narrative",
            text=context_prefix + piece,
            page_number=page.page_number,
            section_heading=page.section_heading,
            metadata={"source": "narrative"},
        ))
    return chunks


def chunk_table_rows(page: ExtractedPage, table: ExtractedTable) -> list:
    """One chunk per row, header baked into the sentence text (not left in a
    separate header row), caption + page heading prepended as context. This
    is the fix for the "mines A-D vs mines E-H" disambiguation problem: each
    row's identity is inline in the embedded text, not implied by which
    table it happened to sit in."""
    chunks = []
    context_bits = []
    if page.section_heading:
        context_bits.append(page.section_heading)
    if table.caption:
        context_bits.append(table.caption)
    context_prefix = f"[{' - '.join(context_bits)}] " if context_bits else ""

    for i, row in enumerate(table.rows):
        # e.g. "Financial Performance Criteria: Turnover...; Unit: Rs. crore; ..."
        row_sentence = "; ".join(f"{col}: {val}" for col, val in row.items() if val not in (None, ""))
        text = f"{context_prefix}{row_sentence}"
        if table.notes:
            text += f" (Note: {table.notes})"
        chunks.append(Chunk(
            chunk_id=f"{table.table_id}_row{i}",
            chunk_type="table_row",
            text=text,
            page_number=page.page_number,
            section_heading=page.section_heading,
            metadata={
                "table_id": table.table_id,
                "table_caption": table.caption,
                "row_index": i,
                "row_data": row,  # kept for the structured store, see sqlite_store.py
            },
        ))
    return chunks


def chunk_page(page: ExtractedPage) -> list:
    chunks = chunk_narrative(page)
    for table in page.tables:
        chunks.extend(chunk_table_rows(page, table))
    return chunks
