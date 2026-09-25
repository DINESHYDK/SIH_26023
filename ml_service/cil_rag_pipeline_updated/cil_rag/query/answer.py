"""
Answer generation with enforced citations. Two layers, matching the earlier
discussion of why a prompt instruction alone doesn't guarantee grounded
citations:
  1. the prompt template requires citing chunk IDs and forbids answering
     outside the provided context
  2. after generation, validate_citations() checks every cited ID actually
     exists in what was sent -- catches the model citing something it was
     never given, without needing a second model call to verify.
"""
import re
import os
import time
import random

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

PROMPT_TEMPLATE = """You are an assistant answering questions about a Coal
India Limited / Ministry of Coal MoU document, using only the context chunks
below. Each chunk has an ID in [brackets].

Rules:
- Answer ONLY from the chunks provided. If the answer isn't in them, say so
  explicitly -- do not use outside knowledge.
- After every factual claim, cite the chunk ID(s) it came from, like [p3_row2].
- Do not cite a chunk ID that isn't listed below.

Context chunks:
{context}

Question: {question}

Answer:"""


def _format_context(chunks_with_scores) -> str:
    # Reorder so the strongest matches sit at the start and end, not buried
    # in the middle -- the actual fix for lost-in-the-middle, on top of
    # whatever reranking already narrowed the candidate set to.
    ranked = [c for c, _ in chunks_with_scores]
    if len(ranked) > 2:
        reordered = []
        left, right = 0, len(ranked) - 1
        take_left = True
        while left <= right:
            if take_left:
                reordered.append(ranked[left]); left += 1
            else:
                reordered.append(ranked[right]); right -= 1
            take_left = not take_left
        ranked = reordered
    return "\n".join(f"[{c.chunk_id}] {c.text}" for c in ranked)


def validate_citations(answer_text: str, chunks_with_scores) -> list:
    """Returns any cited IDs that were NOT in the provided context -- an
    empty list means every citation checks out."""
    valid_ids = {c.chunk_id for c, _ in chunks_with_scores}
    cited_ids = set(re.findall(r"\[([\w]+)\]", answer_text))
    return sorted(cited_ids - valid_ids)


def _generate_with_retry(model, prompt, max_retries=4):
    from google.api_core.exceptions import ResourceExhausted
    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt, generation_config=genai.types.GenerationConfig(temperature=0.2)
            )
            return response.text
        except ResourceExhausted:
            if attempt == max_retries - 1:
                raise
            wait = (2 ** (attempt + 1)) + random.uniform(0, 1)
            time.sleep(wait)


def generate_cited_answer(question: str, chunks_with_scores) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set -- see demo_query.py for an offline retrieval-only demo.")
    context = _format_context(chunks_with_scores)
    prompt = PROMPT_TEMPLATE.format(context=context, question=question)
    model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    answer_text = _generate_with_retry(model, prompt)
    bad_citations = validate_citations(answer_text, chunks_with_scores)
    return {"answer": answer_text, "invalid_citations": bad_citations}
