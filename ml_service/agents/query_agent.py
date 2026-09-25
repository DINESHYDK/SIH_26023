"""LangGraph query agent for both typed-vector and scanned-OCR documents."""
from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncIterator, TypedDict

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph

from agents.scanned_rag import scanned_document_rag
from agents.typed_rag import typed_document_rag
from agents.gemini_rate_limiter import gemini_rate_limiter

# Uvicorn does not load a project .env file by itself. Load it before the
# graph runs so both API-key names work in local and deployed environments.
load_dotenv()

class QueryState(TypedDict, total=False):
    question: str
    document_ids: list[str]
    document_types: dict[str, str]
    contexts: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    prompt: str
    answer: str


def _validate_id(document_id: str) -> None:
    if len(document_id) != 16 or any(char not in "0123456789abcdef" for char in document_id):
        raise ValueError("context_doc is not a valid document ID")


def _available_document_ids() -> list[str]:
    """Return every successfully indexed upload for an unscoped query."""
    ids = set()
    from agents.typed_rag import DOCUMENT_ROOT as TYPED_ROOT
    from agents.scanned_rag import DOCUMENT_ROOT as SCANNED_ROOT
    for root, rag in ((TYPED_ROOT, typed_document_rag), (SCANNED_ROOT, scanned_document_rag)):
        if root.exists():
            ids.update(path.name for path in root.iterdir() if path.is_dir() and rag.exists(path.name))
    return sorted(ids)


def _locate_document(state: QueryState) -> QueryState:
    document_ids = state["document_ids"] or _available_document_ids()
    if not document_ids:
        raise FileNotFoundError("No indexed documents are available. Upload a document before querying.")
    types: dict[str, str] = {}
    for document_id in document_ids:
        _validate_id(document_id)
        if typed_document_rag.exists(document_id):
            types[document_id] = "typed"
        elif scanned_document_rag.exists(document_id):
            types[document_id] = "scanned"
        else:
            raise FileNotFoundError(f"Document {document_id} is not indexed. Upload it before querying.")
    return {"document_ids": document_ids, "document_types": types}


def _retrieve(state: QueryState) -> QueryState:
    document_ids = state["document_ids"]
    per_document = max(1, 12 // len(document_ids))
    contexts: list[dict[str, Any]] = []
    for document_id in document_ids:
        # Prefix IDs with their document so citations remain unambiguous when
        # two documents both have a page 1 / chunk 1.
        if state["document_types"][document_id] == "typed":
            matches = typed_document_rag.retrieve(state["question"], document_id, k=per_document)
            contexts.extend({**item, "id": f"{document_id}:{item['id']}"} for item in matches)
            continue
        result = scanned_document_rag.retrieve(state["question"], document_id, k=per_document)
        if result["route"] == "structured":
            contexts.append({"id": f"{document_id}:{result['matched_table']}",
                             "page": result["page_number"],
                             "text": "\n".join(str(row) for row in result["rows"])})
        else:
            contexts.extend({"id": f"{document_id}:{chunk.chunk_id}", "page": chunk.page_number,
                             "text": chunk.text, "score": float(score)}
                            for chunk, score in result["results"][:per_document])
    if not contexts:
        raise ValueError("No retrievable content was found in the selected documents")
    return {"contexts": contexts,
            "citations": [{"page": item["page"], "source": item["id"]} for item in contexts]}


def _prepare_prompt(state: QueryState) -> QueryState:
    """Build the grounded prompt after LangGraph has completed retrieval."""
    context = "\n\n".join(
        f"[{item['id']}, page {item['page']}] {item['text']}" for item in state["contexts"]
    )
    prompt = (
        "Answer only from the supplied document context. If it does not contain the answer, say so. "
        "Use concise citations like [p3_c1] for every factual claim.\n\n"
        f"Context:\n{context}\n\nQuestion: {state['question']}"
    )
    return {"prompt": prompt}


def _model() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("Set GEMINI_API_KEY (or GOOGLE_API_KEY) before generating answers")
    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        google_api_key=api_key,
        temperature=0.2,
        streaming=True,
    )


def _token_text(content: Any) -> str:
    """Normalize Gemini client token formats across LangChain versions."""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return str(content.get("text", ""))
    if isinstance(content, list):
        return "".join(_token_text(part) for part in content)
    return ""


_graph_builder = StateGraph(QueryState)
_graph_builder.add_node("locate_document", _locate_document)
_graph_builder.add_node("retrieve", _retrieve)
_graph_builder.add_node("prepare_prompt", _prepare_prompt)
_graph_builder.add_edge(START, "locate_document")
_graph_builder.add_edge("locate_document", "retrieve")
_graph_builder.add_edge("retrieve", "prepare_prompt")
_graph_builder.add_edge("prepare_prompt", END)
query_graph = _graph_builder.compile()


def _normalise_document_ids(context_doc: str | list[str] | None) -> list[str]:
    """Accept omitted, array, or comma-separated document IDs from /query."""
    if context_doc is None:
        return []
    raw_ids = context_doc.split(",") if isinstance(context_doc, str) else context_doc
    return list(dict.fromkeys(item.strip() for item in raw_ids if item and item.strip()))


async def stream_document_answer(query: str, context_doc: str | list[str] | None = None) -> AsyncIterator[str]:
    """Run the LangGraph RAG workflow and expose only answer tokens to FastAPI."""
    # Do not use LangGraph's custom writer here: some async runtimes do not
    # propagate its runnable context. The graph owns routing/retrieval/prompt
    # preparation, while this direct provider stream reliably forwards tokens.
    result = await query_graph.ainvoke({"question": query, "document_ids": _normalise_document_ids(context_doc)})
    # LangChain's streaming call eventually makes one Gemini request. Reserve
    # it in the shared synchronous limiter without blocking FastAPI's loop.
    await asyncio.to_thread(gemini_rate_limiter.acquire)
    emitted_text = False
    async for chunk in _model().astream(result["prompt"]):
        token = _token_text(chunk.content)
        if token:
            emitted_text = True
            yield token
    if not emitted_text:
        raise RuntimeError("The LLM returned no answer text; verify GEMINI_MODEL and API access")
    if result["citations"]:
        yield "\n\nSources:\n" + "\n".join(
            f"- page {item['page']}: {item['source']}" for item in result["citations"]
        )


def answer_document_query(query: str, context_doc: str) -> dict:
    """Compatibility helper retained for callers that used the older sync API."""
    raise RuntimeError("Use stream_document_answer() for the LangGraph query agent")
