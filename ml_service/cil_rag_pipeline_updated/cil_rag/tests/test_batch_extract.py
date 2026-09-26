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


class FakeClock:
    """Deterministic time: sleep() advances monotonic() instantly."""
    def __init__(self):
        self.now, self.sleeps = 1000.0, []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(ve.time, "monotonic", fake.monotonic)
    monkeypatch.setattr(ve.time, "sleep", fake.sleep)
    return fake


@pytest.fixture
def env(tmp_path, monkeypatch, clock):
    monkeypatch.setattr(ve.gemini_rate_limiter, "acquire", lambda: None)
    # Backoff state is process-wide: isolate each test, and default to one model.
    ve._model_health.reset()
    monkeypatch.setattr(ve, "GEMINI_MODELS", ["primary"])
    paths = {}
    for pn in range(1, 9):
        p = tmp_path / f"page_{pn}.png"; p.write_bytes(b"png"); paths[pn] = str(p)
    return paths


def _fake_generate(calls, responder, models=None):
    def gen(parts, model=ve.GEMINI_MODEL_NAME):
        labels = [p[1] for p in parts if p[0] == "text" and p[1].startswith("PAGE ")]
        nums = [int(l.split()[1].rstrip(":")) for l in labels]
        calls.append(nums)
        if models is not None:
            models.append(model)
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


def test_429_waits_for_server_retry_delay_then_succeeds(env, monkeypatch, clock):
    calls = []
    sleeps = clock.sleeps
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


def test_overloaded_model_falls_back_to_next_model(env, monkeypatch):
    calls, models = [], []
    monkeypatch.setattr(ve, "GEMINI_MODELS", ["primary", "fallback"])
    def responder(nums, n):
        if models[-1] == "primary":
            raise FakeAPIError(503, "503 UNAVAILABLE. This model is currently experiencing high demand.")
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder, models))
    batches = []
    out = extract_pages({1: env[1], 2: env[2]}, batch_size=8, on_batch=batches.append)
    assert sorted(out) == [1, 2]
    # No waiting out primary's spike: the ready fallback is used straight away.
    assert models == ["primary", "fallback"]
    assert len(batches) == 1 and batches[0].model == "fallback"


def test_all_models_overloaded_raises_models_unavailable_after_budget(env, monkeypatch, clock):
    monkeypatch.setattr(ve, "GEMINI_MODELS", ["primary", "fallback"])
    calls = []
    def responder(nums, n):
        raise FakeAPIError(503, "503 UNAVAILABLE")
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    start = clock.now
    with pytest.raises(ve.ModelsUnavailable):
        extract_pages({1: env[1]}, batch_size=1)
    # Kept trying for (nearly) the whole budget, never past it.
    assert ve.RETRY_BUDGET_S - ve.MAX_BACKOFF_S <= clock.now - start <= ve.RETRY_BUDGET_S
    assert 4 < len(calls) < 60


def test_backoff_is_exponential_capped_and_jittered(env, monkeypatch, clock):
    monkeypatch.setattr(ve.random, "uniform", lambda low, high: high)  # take the jitter ceiling
    delays = [ve._model_health.failed("m", None) for _ in range(8)]
    assert delays == [2, 4, 8, 16, 32, 60, 60, 60]
    monkeypatch.setattr(ve.random, "uniform", lambda low, high: low)
    ve._model_health.reset()
    assert ve._model_health.failed("m", 41.5) == 41.5  # server's retryDelay is a floor
    ve._model_health.succeeded("m")
    assert ve._model_health.failed("m", None) == ve.BASE_BACKOFF_S  # success resets the streak


def test_backoff_is_shared_across_concurrent_callers(env, monkeypatch, clock):
    """A second batch must respect the first batch's backoff instead of hitting the model."""
    calls = []
    def responder(nums, n):
        if n == 1:
            raise FakeAPIError(503, "503 UNAVAILABLE")
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    ve._model_health.failed("primary", 30)  # another upload just saw primary fail
    extract_pages({1: env[1]}, batch_size=1)
    assert clock.sleeps[0] >= 30


def test_daily_quota_retires_model_and_uses_fallback(env, monkeypatch):
    calls, models = [], []
    monkeypatch.setattr(ve, "GEMINI_MODELS", ["primary", "fallback"])
    def responder(nums, n):
        if models[-1] == "primary":
            raise FakeAPIError(429, "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier")
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder, models))
    extract_pages({1: env[1], 2: env[2]}, batch_size=1)
    assert models == ["primary", "fallback", "fallback"]  # primary never retried once retired


def test_network_timeouts_are_retried_but_client_errors_are_not(env, monkeypatch):
    calls = []
    def responder(nums, n):
        if n == 1:
            raise TimeoutError("read timed out")
        return json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP"
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, responder))
    assert 1 in extract_pages({1: env[1]}, batch_size=1) and len(calls) == 2

    calls.clear()
    def bad_request(nums, n):
        raise FakeAPIError(400, "INVALID_ARGUMENT")
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(calls, bad_request))
    with pytest.raises(FakeAPIError):
        extract_pages({1: env[1]}, batch_size=1)
    assert len(calls) == 1


def test_on_batch_receives_the_exact_images_sent(env, monkeypatch):
    calls = []
    monkeypatch.setattr(ve, "_generate_json", _fake_generate(
        calls, lambda nums, n: (json.dumps({"pages": [_page_json(p) for p in nums]}), "STOP")))
    batches = []
    extract_pages({k: env[k] for k in (1, 2, 3)}, batch_size=2, on_batch=batches.append)
    assert [b.page_numbers for b in batches] == [[1, 2], [3]]
    assert batches[0].images[1] == (b"png", "image/png") and set(batches[0].pages) == {1, 2}
