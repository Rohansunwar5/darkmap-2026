import httpx
from fastapi.testclient import TestClient

from darkmap.http import ManagedClient


def test_fresh_client_bypasses_existing_get_and_post_cache(session):
    calls = []
    def handler(request):
        calls.append(request.method)
        return httpx.Response(200, json={'revision': len(calls)})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    with ManagedClient(session, 'fresh_test', 'official_api', client=client) as managed:
        assert managed.get('https://example.test/results').json()['revision'] == 1
        assert managed.get('https://example.test/results').from_cache
        assert managed.post('https://example.test/results', json={'q':'Brand'}).json()['revision'] == 2
        assert managed.post('https://example.test/results', json={'q':'Brand'}).from_cache
    with ManagedClient(session, 'fresh_test', 'official_api', client=client, allow_cache=False) as managed:
        assert managed.get('https://example.test/results').json()['revision'] == 3
        assert managed.post('https://example.test/results', json={'q':'Brand'}).json()['revision'] == 4
    assert calls == ['GET', 'POST', 'GET', 'POST']


def test_fresh_repeat_query_queues_new_jobs_and_passes_fresh_to_collector(app_env, monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)
    from darkmap.api import app
    with TestClient(app) as client:
        payload={'mode':'account','query':'example','fresh':True}
        first=client.post('/v1/instagram/scrape',json=payload)
        second=client.post('/v1/instagram/scrape',json=payload)
        assert first.status_code == second.status_code == 202
        assert first.json()['id'] != second.json()['id']
        assert first.json()['payload']['params']['fresh'] is True
