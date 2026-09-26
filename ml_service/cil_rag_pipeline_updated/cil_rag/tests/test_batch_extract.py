import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from ingestion import vision_extract as ve
from ingestion.vision_extract import extract_pages, DailyQuotaExceeded


class FakeAPIError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg); self.code = code


def _page_json(pn, rows=None, cols=("Item", "Value")):
    return {"page_number": pn, "section_heading": f"H{pn}", "narrative_text": "",
            "tables": [{"table_id": f"t{pn}", "caption": "cap", "columns": list(cols),
                        "rows": rows if rows is not None else [[f"a{pn}", "1"], [f"b{pn}", "2"]],
                        "notes": None}]}


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(ve.time, "sleep", lambda s: None)
    monkeypatch.setattr(ve, "_limiter", ve._RateLimiter(0))
    paths = {}
    for pn in range(1, 9):
        p = tmp_path / f"page_{pn}.png"; p.write_bytes(b"png"); paths[pn] = str(p)
    return paths


def _fake_generate(calls, responder):
    def gen(parts):
        labels = [p[1] for p in parts if p[0] == "text" and p[1].startswith("PAGE ")]
        nums = [int(l.split()[1].rstrip(":")) for l in labels]
        calls.append(nums)
        return responder(nums, len(calls))
    return gen


def test_batches_pages_into_few_requests_and_expands_rows(env, monkeypatch):
    calls, saved = [], []
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(
        calls, lambda nums, n: (json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP")))
    out = extract_pages(env, batch_size=4, on_page=saved.append)
    assert calls == [[1, 2, 3, 4], [5, 6, 7, 8]]          # 8 pages -> 2 requests
    assert sorted(out) == list(range(1, 9)) and len(saved) == 8
    assert out[3].tables[0].rows[0] == {"Item": "a3", "Value": "1"}  # compact rows -> dicts


def test_truncated_batch_is_bisected(env, monkeypatch):
    calls = []
    def responder(nums, n):
        if len(nums) > 2:
            return "", "FinishReason.MAX_TOKENS"
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    out = extract_pages({k: env[k] for k in (1, 2, 3, 4)}, batch_size=4)
    assert sorted(out) == [1, 2, 3, 4]
    assert calls == [[1, 2, 3, 4], [1, 2], [3, 4]]


def test_page_dropped_by_model_is_retried(env, monkeypatch):
    calls = []
    def responder(nums, n):
        got = [p for p in nums if not (n == 1 and p == 3)]  # first call omits page 3
        return json.dumps({"pages": [_page_json(p) for p in got]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    out = extract_pages({k: env[k] for k in (1, 2, 3)}, batch_size=3)
    assert sorted(out) == [1, 2, 3] and calls == [[1, 2, 3], [3]]


def test_429_waits_for_server_retry_delay_then_succeeds(env, monkeypatch):
    sleeps, calls = [], []
    monkeypatch.setattr(ve.time, "sleep", sleeps.append)
    def responder(nums, n):
        if n == 1:
            raise FakeAPIError(429, "RESOURCE_EXHAUSTED ... Please retry in 41.5s.")
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    out = extract_pages({1: env[1]}, batch_size=1)
    assert 1 in out and len(calls) == 2
    assert sleeps and sleeps[0] >= 41.5      # honored the server's delay, not a 2s backoff


def test_daily_quota_is_not_retried(env, monkeypatch):
    calls = []
    def responder(nums, n):
        raise FakeAPIError(429, "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier")
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    with pytest.raises(DailyQuotaExceeded):
        extract_pages({1: env[1]}, batch_size=1)
    assert len(calls) == 1


def test_ragged_rows_and_duplicate_columns_lose_no_data(env, monkeypatch):
    calls = []
    page = _page_json(1, rows=[["x"], ["a", "b", "c"]], cols=("Year", "Year"))
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(
        calls, lambda nums, n: (json.dumps({"pages": [page]}), "STOP")))
    t = extract_pages({1: env[1]}, batch_size=1)[1].tables[0]
    assert t.columns == ["Year", "Year (2)"]
    assert t.rows[0] == {"Year": "x", "Year (2)": ""}
    assert t.rows[1] == {"Year": "a", "Year (2)": "b", "extra_1": "c"}


def test_mislabeled_page_numbers_fall_back_to_order(env, monkeypatch):
    calls = []
    def responder(nums, n):
        pages = [_page_json(99 + i) for i, _ in enumerate(nums)]  # all wrong numbers
        return json.dumps({"pages": pages}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    out = extract_pages({k: env[k] for k in (5, 6)}, batch_size=2)
    assert sorted(out) == [5, 6] and out[5].section_heading == "H99"
