import datetime as dt
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from darkmap import queue
from darkmap.ai.claude import ClaudeAnalysisProvider
from darkmap.config import Settings, reset_settings_cache
from darkmap.http import ManagedClient
from darkmap.models import Account, MediaAsset, Post, SearchDocument, utcnow
from darkmap.quota import QuotaExceeded, usage
from darkmap.search import search


def _analysis_body(*, evidence=None, finish_reason='stop'):
    content = json.dumps({
        'overall_score': 81,
        'confidence': 0.8,
        'summary': 'Observed brand-like identity and credential language.',
        'category_scores': {'brand_impersonation': 85, 'credential_harvesting': 75},
        'evidence': evidence or [],
        'limitations': [],
        'recommended_action': 'evidence_package',
    })
    return {
        'choices': [{'finish_reason': finish_reason,
                     'message': {'role': 'assistant', 'content': content}}],
        'usage': {'prompt_tokens': 120, 'completion_tokens': 80, 'total_tokens': 200},
    }


def test_experiential_key_accepts_requested_environment_name(monkeypatch):
    monkeypatch.setenv('EXPLABS_API_KEY', 'test-explabs-key')
    monkeypatch.delenv('EXPERIENTIAL_LABS_API_KEY', raising=False)

    settings = Settings(_env_file=None)

    assert settings.experiential_labs_api_key == 'test-explabs-key'
    assert settings.ai_enabled is True


def test_claude_uses_experiential_chat_completions_and_preserves_usage(app_env):
    seen = {}

    def handler(request):
        seen['url'] = str(request.url)
        seen['auth'] = request.headers.get('authorization')
        seen['body'] = json.loads(request.content)
        return httpx.Response(200, json=_analysis_body(evidence=[{
            'category': 'brand_impersonation', 'signal': 'brand_name',
            'field': 'account.display_name', 'quote': 'Luminaire Support',
            'weight': 0.8, 'rationale': 'Uses the protected brand name.',
        }]))

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = ClaudeAnalysisProvider(api_key='test-key', client=client)
    result = provider.analyze({
        'account': {'display_name': 'Luminaire Support'}, 'posts': [], 'entities': []})

    assert seen['url'] == 'https://api.experientiallabs.ai/v1/chat/completions'
    assert seen['auth'] == 'Bearer test-key'
    assert seen['body']['model'] == 'claude-opus-5'
    assert seen['body']['messages'][0]['role'] == 'system'
    assert seen['body']['messages'][1]['role'] == 'user'
    assert seen['body']['reasoning_effort'] == 'low'
    assert result.available is True
    assert result.raw['usage']['total_tokens'] == 200
    assert result.evidence[0]['quote'] == 'Luminaire Support'


def test_claude_retries_429_and_rejects_ungrounded_evidence(app_env):
    calls = []
    sleeps = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(429, headers={'Retry-After': '1'}, text='rate limited')
        return httpx.Response(200, json=_analysis_body(evidence=[{
            'category': 'credential_harvesting', 'signal': 'fabricated',
            'field': 'posts[9].caption', 'quote': 'send your password',
            'weight': 1, 'rationale': 'This field does not exist.',
        }]))

    provider = ClaudeAnalysisProvider(
        api_key='test-key', client=httpx.Client(transport=httpx.MockTransport(handler)),
        sleep=sleeps.append)
    result = provider.analyze({'account': {'handle': 'example'}, 'posts': [], 'entities': []})

    assert len(calls) == 2
    assert sleeps == [1.0]
    assert result.available is True
    assert result.evidence == []
    assert result.confidence == 0.35
    assert 'discarded_1_ungrounded_ai_evidence_items' in result.limitations


def test_claude_fails_soft_on_incomplete_response(app_env):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=_analysis_body(finish_reason='length')))
    provider = ClaudeAnalysisProvider(api_key='test-key', client=httpx.Client(transport=transport))
    result = provider.analyze({'account': {'handle': 'example'}})
    assert result.available is False
    assert 'finish_reason' in result.error


def test_managed_http_honors_retry_after_caches_and_tracks_quota(session):
    calls = []
    sleeps = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(429, headers={'Retry-After': '1'}, text='slow down')
        return httpx.Response(200, headers={'Content-Type': 'application/json'},
                              json={'ok': True})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    with ManagedClient(session, 'test_http', 'official_api', client=client,
                       sleep=sleeps.append) as managed:
        first = managed.get('https://allowed.example/data')
        second = managed.get('https://allowed.example/data')

    assert first.json() == {'ok': True}
    assert second.from_cache is True
    assert len(calls) == 2
    assert len(sleeps) == 1 and sleeps[0] == 1
    assert usage(session, 'test_http')['minute'] == 2


def test_managed_http_stops_at_configured_quota(session):
    client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, text='ok')))
    with ManagedClient(session, 'quota_test', 'official_api', client=client) as managed:
        for idx in range(5):
            managed.get(f'https://allowed.example/{idx}', use_cache=False)
        with pytest.raises(QuotaExceeded):
            managed.get('https://allowed.example/blocked', use_cache=False)


def test_queue_skips_live_lease_and_recovers_stale_job(session):
    first = queue.enqueue(session, 'analyze', {'account_id': 1})
    second = queue.enqueue(session, 'analyze', {'account_id': 2})
    session.commit()

    leased_first = queue.claim(session, worker_id='worker-a')
    assert leased_first.id == first.id
    leased_second = queue.claim(session, worker_id='worker-b')
    assert leased_second.id == second.id
    queue.complete(session, leased_second, {'ok': True})
    session.commit()

    leased_first.locked_at = utcnow() - dt.timedelta(seconds=queue.LEASE_SECONDS + 1)
    session.commit()
    recovered = queue.claim(session, worker_id='worker-c')
    assert recovered.id == first.id
    assert recovered.locked_by == 'worker-c'
    assert recovered.attempts == 2


def test_search_treats_like_wildcards_as_literals(session):
    session.add_all([
        Account(id=1, platform='instagram', handle='plain', handle_lower='plain'),
        Account(id=2, platform='instagram', handle='sale_percent',
                handle_lower='sale_percent'),
    ])
    session.flush()
    session.add_all([
        SearchDocument(doc_type='account', account_id=1, handle='plain', title='Plain',
                       body='ordinary text', body_lower='ordinary text'),
        SearchDocument(doc_type='account', account_id=2, handle='sale_percent', title='Sale',
                       body='save 50% today', body_lower='save 50% today'),
    ])
    session.flush()
    result = search(session, q='%')
    assert result['total'] == 1
    assert result['hits'][0]['account_id'] == 2


def test_global_search_covers_structured_entities_and_scopes(session):
    session.add(Account(id=3, platform='instagram', handle='signals', handle_lower='signals'))
    session.flush()
    session.add(SearchDocument(
        doc_type='post', account_id=3, handle='signals', title='Unrelated caption',
        body='ordinary text', body_lower='ordinary text',
        hashtags=['watchlist'], mentions=['brand_help'], domains=['suspicious.example'],
    ))
    session.flush()

    hashtag_result = search(session, q='watchlist', scope='hashtags')
    assert hashtag_result['total'] == 1
    assert hashtag_result['facets']['hashtags'] == 1
    assert hashtag_result['hits'][0]['matched_fields'] == ['hashtags']
    assert search(session, q='watchlist', scope='hashtags', account_ids=[999])['total'] == 0

    url_result = search(session, q='suspicious', scope='urls')
    assert url_result['total'] == 1
    assert 'urls' in url_result['hits'][0]['matched_fields']

    assert search(session, q='watchlist', scope='accounts')['total'] == 0


def test_global_search_prioritizes_high_risk_impostor_over_official_exact_match(session):
    session.add_all([
        Account(id=20, platform='instagram', handle='lenskart', handle_lower='lenskart',
                is_verified=True, latest_risk_score=0),
        Account(id=21, platform='instagram', handle='lenskart.support',
                handle_lower='lenskart.support', latest_risk_score=90),
    ])
    session.flush()
    session.add_all([
        SearchDocument(doc_type='account', account_id=20, handle='lenskart',
                       title='Lenskart', body='official lenskart', body_lower='official lenskart',
                       risk_score=0),
        SearchDocument(doc_type='account', account_id=21, handle='lenskart.support',
                       title='Lenskart Support', body='lenskart help',
                       body_lower='lenskart help', risk_score=90),
    ])
    session.flush()

    result = search(session, q='lenskart')
    assert result['hits'][0]['handle'] == 'lenskart.support'


def test_global_search_prioritizes_low_follower_mentions_at_equal_risk(session):
    session.add_all([
        Account(id=30, platform='instagram', handle='large.news', handle_lower='large.news',
                followers_count=420_000, latest_risk_score=20),
        Account(id=31, platform='instagram', handle='small.offer', handle_lower='small.offer',
                followers_count=45, latest_risk_score=20),
    ])
    session.flush()
    session.add_all([
        SearchDocument(doc_type='account', account_id=30, handle='large.news',
                       title='Large news', body='lenskart update',
                       body_lower='lenskart update', risk_score=20),
        SearchDocument(doc_type='account', account_id=31, handle='small.offer',
                       title='Small offer', body='lenskart update',
                       body_lower='lenskart update', risk_score=20),
    ])
    session.flush()

    result = search(session, q='lenskart')

    assert [hit['handle'] for hit in result['hits'][:2]] == ['small.offer', 'large.news']
    assert result['hits'][0]['ranking_factors']['low_follower_priority'] == 2.6
    assert result['hits'][1]['ranking_factors']['low_follower_priority'] == -0.8


def test_search_uses_profile_photo_when_reel_only_has_a_video_file(session):
    account = Account(id=34, platform='instagram', handle='brand.video',
                      handle_lower='brand.video',
                      profile_pic_url='https://cdn.example/profile.jpg')
    session.add(account)
    session.flush()
    post = Post(account_id=account.id, platform_post_id='video-1', post_type='reel',
                permalink='https://www.instagram.com/reel/VIDEO1/', caption='brand offer')
    session.add(post)
    session.flush()
    session.add(MediaAsset(post_id=post.id, media_type='video',
                           media_url='https://cdn.example/reel.mp4'))
    session.add(SearchDocument(doc_type='post', account_id=account.id, post_id=post.id,
                               handle='brand.video', title='Brand video', body='brand offer',
                               body_lower='brand offer', risk_score=10))
    session.flush()

    hit = search(session, q='brand')['hits'][0]
    assert hit['image_url'] == 'https://cdn.example/profile.jpg'
    assert hit['profile_pic_url'] == 'https://cdn.example/profile.jpg'


def test_strong_fraud_evidence_still_outranks_follower_adjustment(session):
    session.add_all([
        Account(id=32, platform='instagram', handle='large.phish', handle_lower='large.phish',
                followers_count=250_000, latest_risk_score=95),
        Account(id=33, platform='instagram', handle='small.mention', handle_lower='small.mention',
                followers_count=12, latest_risk_score=0),
    ])
    session.flush()
    session.add_all([
        SearchDocument(doc_type='account', account_id=32, handle='large.phish',
                       title='Large phish', body='lenskart login scam',
                       body_lower='lenskart login scam', risk_score=95),
        SearchDocument(doc_type='account', account_id=33, handle='small.mention',
                       title='Small mention', body='lenskart mention',
                       body_lower='lenskart mention', risk_score=0),
    ])
    session.flush()

    assert search(session, q='lenskart')['hits'][0]['handle'] == 'large.phish'


def test_api_key_auth_request_limit_and_secret_redaction(app_env, monkeypatch):
    monkeypatch.setenv('DARKMAP_API_KEY', 'local-api-key')
    monkeypatch.setenv('DARKMAP_MAX_REQUEST_BYTES', '500')
    reset_settings_cache()
    from darkmap.api import app

    with TestClient(app) as client:
        dashboard = client.get('/')
        assert dashboard.status_code == 200
        assert 'Start an Instagram investigation' in dashboard.text
        assert 'Scan Brand Abuse Across the Internet' in dashboard.text
        assert 'id="downloadResults"' in dashboard.text
        javascript = client.get('/static/app.js')
        assert javascript.status_code == 200
        assert "schema: 'darkmap-instagram-search/v1'" in javascript.text
        assert 'risk_rank' in javascript.text
        assert client.get('/privacy').status_code == 200
        assert client.get('/data-deletion').status_code == 200
        assert client.get('/healthz').status_code == 200
        assert client.get('/v1/brands').status_code == 401
        headers = {'X-API-Key': 'local-api-key'}
        global_search = client.get('/v1/search?q=example&scope=all', headers=headers)
        assert global_search.status_code == 200
        assert set(global_search.json()['facets']) == {
            'accounts', 'posts', 'hashtags', 'mentions', 'urls'
        }
        created = client.post('/v1/brands', headers=headers, json={
            'name': 'Example', 'official_handles': ['example'],
            'official_domains': ['example.com'], 'keywords': [],
        })
        assert created.status_code == 201
        scrape = client.post('/v1/instagram/scrape', headers=headers, json={
            'mode': 'hashtag_recent', 'query': 'example',
            'brand_id': created.json()['id'], 'max_items': 25,
        })
        assert scrape.status_code == 202
        assert scrape.json()['payload']['provider'] == 'instagram_graph'
        assert scrape.json()['payload']['params']['mode'] == 'hashtag_recent'
        live_search = client.post('/v1/instagram/scrape', headers=headers, json={
            'mode': 'keyword', 'query': 'example', 'profile_limit': 12,
            'brand_id': created.json()['id'], 'max_items': 50,
        })
        assert live_search.status_code == 202
        assert live_search.json()['payload']['params']['mode'] == 'keyword'
        assert live_search.json()['payload']['params']['profile_limit'] == 12
        job = client.post('/v1/ingest/jobs', headers=headers, json={
            'provider': 'instagram_graph', 'handle': 'example',
            'params': {'access_token': 'do-not-return', 'business_id': '123'},
            'analyze': False,
        })
        assert job.status_code == 202
        assert job.json()['payload']['params']['access_token'] == '[REDACTED]'
        response = client.post('/v1/brands', headers={**headers, 'content-length': '501'},
                               content=b'{}')
        assert response.status_code == 413
