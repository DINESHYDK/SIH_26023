"""
Builds the two indexes hybrid retrieval needs: BM25 (lexical) and vector
(semantic). BM25 runs fully offline with rank_bm25 -- no external calls, so
it's testable right here. The vector side needs an embedding model
(e.g. BAAI/bge-m3 for multilingual support, as discussed) which requires
downloading weights from Hugging Face -- this sandbox has no network route to
huggingface.co, so embed_chunks() is written for real but can't execute here.
Swap in your model when running this in an environment with internet access;
nothing else in the pipeline needs to change.
"""
import pickle
import math
from collections import Counter
from functools import lru_cache

try:
    from rank_bm25 import BM25Okapi
except ModuleNotFoundError:
    class BM25Okapi:  # type: ignore[no-redef]
        """Minimal BM25 fallback when the optional rank_bm25 wheel is absent.

        Keeping this fallback local means scanned-document ingestion remains
        available in deployed environments that installed the core service but
        missed the optional retrieval dependency.
        """
        def __init__(self, corpus, k1: float = 1.5, b: float = 0.75):
            self.corpus = corpus
            self.k1 = k1
            self.b = b
            self.lengths = [len(document) for document in corpus]
            self.average_length = sum(self.lengths) / len(self.lengths) if self.lengths else 0.0
            document_frequency = Counter(term for document in corpus for term in set(document))
            total = len(corpus)
            self.idf = {term: math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))
                        for term, frequency in document_frequency.items()}
            self.frequencies = [Counter(document) for document in corpus]

        def get_scores(self, query):
            scores = []
            for frequency, length in zip(self.frequencies, self.lengths):
                score = 0.0
                for term in query:
                    count = frequency.get(term, 0)
                    if not count:
                        continue
                    denominator = count + self.k1 * (1 - self.b + self.b * length / (self.average_length or 1))
                    score += self.idf.get(term, 0.0) * count * (self.k1 + 1) / denominator
                scores.append(score)
            return scores


@lru_cache(maxsize=2)
def _get_embedder(model_name: str):
    """Load once per process -- vector_search used to reload the model on every query."""
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(model_name)


def _tokenize(text: str) -> list:
    return text.lower().split()


class HybridIndex:
    def __init__(self):
        self.chunks = []        # list[Chunk], index i matches bm25 corpus i and vectors[i]
        self.bm25 = None
        self.vectors = None     # numpy array, filled by embed_chunks() when embeddings are available

    def build_bm25(self, chunks: list):
        self.chunks = chunks
        tokenized_corpus = [_tokenize(c.text) for c in chunks]
        self.bm25 = BM25Okapi(tokenized_corpus)

    def bm25_search(self, query: str, k: int = 10) -> list:
        """Returns [(chunk, score), ...] sorted by BM25 score descending."""
        scores = self.bm25.get_scores(_tokenize(query))
        ranked = sorted(zip(self.chunks, scores), key=lambda x: x[1], reverse=True)
        return ranked[:k]

    def embed_chunks(self, model_name: str = "BAAI/bge-m3"):
        """Real implementation -- needs internet access to download the model
        the first time. Not runnable in this sandbox; included so the seam is
        exactly where you'd plug it in.
        """
        import numpy as np

        model = _get_embedder(model_name)
        texts = [c.text for c in self.chunks]
        self.vectors = np.array(model.encode(texts, normalize_embeddings=True), dtype=np.float32)

    def vector_search(self, query: str, model_name: str = "BAAI/bge-m3", k: int = 10) -> list:
        if self.vectors is None:
            raise RuntimeError("Call embed_chunks() first (needs network access to the model host).")
        import numpy as np

        model = _get_embedder(model_name)
        q_vec = np.array(model.encode([query], normalize_embeddings=True), dtype=np.float32)[0]
        scores = self.vectors @ q_vec  # cosine similarity, since vectors are normalized
        ranked = sorted(zip(self.chunks, scores), key=lambda x: x[1], reverse=True)
        return ranked[:k]

    def save(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({"chunks": self.chunks, "vectors": self.vectors}, f)
        # bm25 index itself is cheap to rebuild from self.chunks on load,
        # rather than pickling the BM25Okapi object.

    @classmethod
    def load(cls, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        idx = cls()
        idx.chunks = data["chunks"]
        idx.vectors = data["vectors"]
        idx.build_bm25(idx.chunks)
        return idx
