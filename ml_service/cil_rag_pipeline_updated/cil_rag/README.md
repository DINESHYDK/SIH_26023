# CIL RAG pipeline — built and tested against SignedCILMoU2019-20.pdf

## What's actually running vs. what needs your API key

Everything in `ingestion/` and `query/` is real, runnable code. Two things
can't execute in this sandbox (no network route to Google's API or to
Hugging Face) and are clearly marked:
- `vision_extract.extract_page()` — needs `GEMINI_API_KEY`. Tested instead
  against `mock_extract.py`, which is hand-transcribed real content from
  pages 2, 3, and 18 of your actual document, standing in for what Gemini
  should return.
- `index_builder.embed_chunks()` / `vector_search()` — needs to download an
  embedding model (e.g. `BAAI/bge-m3`). BM25 needs no such download and is
  fully tested below.

## What I confirmed by actually running it on your document

`pdfinfo` + `pdffonts` + `pdftotext` confirm this PDF is fully scanned: every
page is one raster JPEG (`pdfimages -list`), and the embedded OCR layer is
badly broken (`pdftotext` returns "Conl lrqon Lrrvutep" for "Coal India
Limited"). This is the scanned-document path from our discussion, not the
digital-PDF path — there's no vector table structure for `pdfplumber` to
find, so vision extraction isn't a nice-to-have here, it's the only option
that works on this file.

Ran ingestion on pages 2, 3, 18 → 13 chunks (11 table rows, 2 narrative), BM25
index built, structured store populated with 2 tables.

**Router test — worked as designed:**
"What was CIL PAT to average net worth for 2018-19 RE" correctly routed to
`structured` and matched the right table (`annex_ii_part_a`).

**Retrieval test — exposed a real problem, not a hypothetical one:**
"What is the MoU target for turnover in the excellent category" and "Which
WCL project has capacity 4.00 Mty" both returned an *irrelevant* narrative
chunk as the top BM25 hit, ranking the actually-relevant row lower. This is
a genuine finding, not a made-up caveat: with only 13 chunks in the index,
BM25's IDF statistics are too noisy to be meaningful — term rarity is
essentially uninformative at this corpus size. It should improve once you
ingest the full 21-page document (more chunks → more stable term
statistics), but don't assume it's fixed until you've actually rerun this
same test against the full corpus.

**Router matching — a real gap, not yet fixed:**
"How many mines are in the WCL milestones table" fell through to semantic
search instead of structured, because the router only matches a query
against table *captions and column names*, not against values that appear
*inside* rows (like "WCL"). That's a known limitation of the keyword-overlap
matcher in `router.py` — worth strengthening before you rely on it for a
demo, e.g. by also indexing distinct row values per table.

## Files

```
ingestion/
  vision_extract.py    # real Gemini vision call (needs GEMINI_API_KEY)
  mock_extract.py       # offline stand-in, real content from pages 2/3/18
  chunker.py             # structure-aware chunking + row-wise table chunks
  sqlite_store.py        # structured store for the aggregate-query path
  index_builder.py       # BM25 (real) + vector index (needs embedding model)
  ingest_pipeline.py      # orchestrates the above
query/
  router.py               # structured-vs-semantic decision (the agentic part)
  rrf.py                   # reciprocal rank fusion for BM25 + vector
  answer.py                 # citation-enforcing prompt + citation validation
  query_pipeline.py          # orchestrates the above
data/
  page_images/               # rasterized pages 1, 2, 3, 18
  structured_store.db          # populated SQLite store from the test run
  index.pkl                     # saved BM25 index from the test run
```

## To run this for real

1. Set `GEMINI_API_KEY` in `.env`. Optional knobs: `GEMINI_RPM` (default 8; raise
   on a paid tier), `EXTRACT_BATCH_SIZE` (default 4), `GEMINI_MODEL`.
2. `pip install google-genai sentence-transformers rank_bm25 pymupdf python-dotenv`
3. `python run_full_ingest.py` -- batched extraction, ~6 requests for 21 pages.
   Each finished page is cached to `data/extracted_pages/`; if a quota error
   stops the run, rerun and it resumes.
4. Call `index.embed_chunks()` after `build_bm25()` and use `use_vector=True`
   in `run_query` for full hybrid retrieval.

## Retrieval pipeline

BM25 (+ vector) -> RRF -> top 30 candidates -> **cross-encoder rerank** -> top k.
`query/reranker.py`, default `BAAI/bge-reranker-v2-m3` (set `RERANKER_MODEL`
for a lighter one, e.g. `cross-encoder/ms-marco-MiniLM-L-6-v2`). Disable with
`run_query(..., use_reranker=False)`; if the model can't load it warns and
falls back to the un-reranked top k (`result["reranked"]` says which happened).

## One thing worth fixing regardless of this pipeline

Both `agent.py` and `main.py` import `google.generativeai`, which Google has
fully sunset — pip install shows "All support for the `google.generativeai`
package has ended. It will no longer be receiving updates or bug fixes."
That's not specific to this new code, it affects your existing RAG app too.
Worth migrating to `google.genai` (the replacement package) before you build
much further on top of either codebase, since new bug fixes and model
support won't land in the old package.
