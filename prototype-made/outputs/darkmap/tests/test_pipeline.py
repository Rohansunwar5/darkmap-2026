import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from darkmap.api import create_app
from darkmap.config import Settings
from darkmap.db import connect, init
from darkmap.ingestion import ingest
from darkmap.providers import Permanent, RemoteProvider, Retryable
from darkmap.schemas import ImportBatch
from darkmap.worker import run_once


ROOT = Path(__file__).parents[1]


def settings(tmp_path, **changes):
    values = {"db": str(tmp_path / "darkmap.sqlite3"), "api_key": "test-key", "provider": "rules"}
    values.update(changes)
    return Settings(**values)


def seed_batch():
    return json.loads((ROOT / "samples" / "authorized_export.json").read_text())


def process_all(config):
    while run_once(config):
        pass


def test_import_worker_search_and_idempotency(tmp_path):
    config = settings(tmp_path)
    app = create_app(config)
    headers = {"X-API-Key": "test-key"}
    with TestClient(app) as client:
        assert client.post("/imports", json=seed_batch()).status_code == 401
        first = client.post("/imports", json=seed_batch(), headers=headers)
        assert first.status_code == 202
        job_ids = first.json()["job_ids"]
        process_all(config)
        result = client.get("/jobs/" + job_ids[1], headers=headers).json()
        assert result["status"] == "done"
        assert result["result"]["score"] == 90
        assert result["result"]["recommended_action"] == "urgent_human_review"
        assert "credential_harvesting" in {f["category"] for f in result["result"]["findings"]}

        search = client.get("/search", params={"q": "password", "account": "@acme.support"}, headers=headers)
        assert search.status_code == 200
        assert search.json()["total"] == 1
        assert client.get("/search", params={"q": "%"}, headers=headers).json()["total"] == 0

        second = client.post("/imports", json=seed_batch(), headers=headers)
        assert second.json()["job_ids"] == job_ids
    with connect(config.db) as db:
        assert db.execute("SELECT count(*) FROM entities").fetchone()[0] == 2
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 2


def test_rejects_naive_timestamp_and_preserves_brand_isolation(tmp_path):
    config = settings(tmp_path)
    app = create_app(config)
    headers = {"X-API-Key": "test-key"}
    bad = seed_batch()
    bad["entities"][0]["provenance"]["collected_at"] = "2026-09-11T08:00:00"
    with TestClient(app) as client:
        assert client.post("/imports", json=bad, headers=headers).status_code == 422
        alpha = seed_batch()
        beta = seed_batch()
        beta["brand"]["name"] = "Beta"
        beta["entities"][1]["caption"] = "Beta has a release announcement"
        assert client.post("/imports", json=alpha, headers=headers).status_code == 202
        assert client.post("/imports", json=beta, headers=headers).status_code == 202
        assert client.get("/search", params={"q": "password", "brand": "beta"}, headers=headers).json()["total"] == 0


class Response:
    def __init__(self, status, body="{}", headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}

    def json(self):
        return json.loads(self._body)


class Client:
    def __init__(self, response):
        self.response = response

    def post(self, *args, **kwargs):
        return self.response


def test_remote_provider_handles_rate_limit_and_invalid_output(tmp_path):
    config = settings(tmp_path, provider="experiential", experiential_key="test-only")
    provider = RemoteProvider(config, Client(Response(429, headers={"retry-after": "7"})))
    with pytest.raises(Retryable) as limited:
        provider.analyze({"brand": {"name": "Acme"}, "entity": {"account": "x", "urls": [], "media": []}, "shared_url_accounts": []})
    assert limited.value.delay == 7
    bad = Response(200, '{"choices": [{"finish_reason": "stop", "message": {"content": "not-json"}}]}')
    with pytest.raises(Permanent):
        RemoteProvider(config, Client(bad)).analyze({"brand": {"name": "Acme"}, "entity": {"account": "x", "urls": [], "media": []}, "shared_url_accounts": []})


def test_expired_worker_lease_becomes_terminal_after_final_attempt(tmp_path):
    config = settings(tmp_path)
    init(config.db)
    batch = seed_batch()
    batch["entities"] = batch["entities"][:1]
    job_id = ingest(config, ImportBatch.model_validate(batch))[0]
    with connect(config.db) as db:
        db.execute("UPDATE jobs SET status='running', attempts=4, lease_until=? WHERE id=?", (time.time() - 1, job_id))
    assert run_once(config) is False
    with connect(config.db) as db:
        job = db.execute("SELECT status, error FROM jobs WHERE id=?", (job_id,)).fetchone()
        assert dict(job) == {"status": "failed", "error": "Worker lease expired"}
