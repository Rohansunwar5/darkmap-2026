import datetime as dt
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from darkmap.config import reset_settings_cache
from darkmap.providers.bright_data_instagram import (
    PROFILE_DATASET, POST_DATASET, REEL_DATASET, COMMENT_DATASET, _discovery_queries,
)
from darkmap.providers.instagram_pages import PagedInstagramCollector, hit_key
from darkmap.search_cursor import InvalidSearchCursor, decode_cursor, encode_cursor


def enable(monkeypatch):
    monkeypatch.setenv('BRIGHT_DATA_API_KEY', 'not-a-real-key')
    monkeypatch.setenv('BRIGHT_DATA_SERP_ZONE', 'test-zone')
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '1000')
    monkeypatch.setenv('DARKMAP_QUOTA_PER_DAY', '10000')
    reset_settings_cache()


def state():
    return {'version': 1, 'expires_at': time.time() + 1000, 'query': 'Brand',
            'retrieved_at': dt.datetime.now().isoformat(), 'visible': [],
            'params': {'mode': 'keyword', 'max_items': 250, 'profile_limit': 50,
                       'include_comments': True, 'comments_per_post': 20}}


def test_checkpoint_integrity_expiry_and_cold_start(app_env, monkeypatch):
    enable(monkeypatch)
    original = state()
    original['snapshots'] = [{'id': 'pending-1', 'dataset': POST_DATASET}]
    token = encode_cursor(original)
    reset_settings_cache()
    assert decode_cursor(token) == original
    assert 'not-a-real-key' not in token
    with pytest.raises(InvalidSearchCursor):
        decode_cursor(('a' if token[0] != 'a' else 'b') + token[1:])
    original['expires_at'] = time.time() - 1
    with pytest.raises(InvalidSearchCursor):
        decode_cursor(encode_cursor(original))


def test_profile_enrichment_prioritizes_accounts_already_found_in_evidence(
        session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    checkpoint['params']['profile_limit'] = 5
    checkpoint['organic'] = [{
        'link': f'https://www.instagram.com/found{i}/',
        'title': f'Found account {i}',
    } for i in range(6)]
    collector = PagedInstagramCollector(session, checkpoint)

    collector._schedule()

    scheduled = checkpoint['scheduled'][PROFILE_DATASET]
    assert scheduled == ['brand', 'found0', 'found1', 'found2', 'found3']
    assert collector._profile_enrichment_pending(collector._bundles()[0]) is True


def test_missing_username_profile_is_retried_once_by_canonical_url(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    collector = PagedInstagramCollector(session, checkpoint)
    task = {
        'dataset': PROFILE_DATASET,
        'inputs': [{'user_name': 'netflix_in'}, {'user_name': 'publisher'}],
        'attempt': 0,
    }

    collector._retry_profile_as_urls(task, returned=['publisher'])

    assert checkpoint['inputs'][0] == {
        'dataset': PROFILE_DATASET,
        'inputs': [{'url': 'https://www.instagram.com/netflix_in/'}],
        'attempt': 1,
        'discover_by': 'url',
    }


def test_incomplete_profile_row_is_retried_by_canonical_url(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    task = {
        'dataset': PROFILE_DATASET, 'id': 'profile-snapshot', 'ready': True,
        'next_poll': 0, 'failures': 0,
        'inputs': [{'user_name': 'netflix_in'}], 'attempt': 0,
        'discover_by': 'user_name',
    }
    checkpoint['snapshots'] = [task]

    def handler(request):
        assert request.url.path.endswith('/snapshot/profile-snapshot')
        # A handle-only row is discovery evidence, but it is not completed enrichment.
        return httpx.Response(200, json=[{'account': 'netflix_in'}])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    collector = PagedInstagramCollector(session, checkpoint, client)
    with collector._managed() as managed:
        collector._poll_one(managed, task)

    assert checkpoint['inputs'][0] == {
        'dataset': PROFILE_DATASET,
        'inputs': [{'url': 'https://www.instagram.com/netflix_in/'}],
        'attempt': 1,
        'discover_by': 'url',
    }


def test_profile_url_retry_uses_collect_by_url_parameters(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    checkpoint['inputs'] = [{
        'dataset': PROFILE_DATASET,
        'inputs': [{'url': 'https://www.instagram.com/netflix_in/'}],
        'attempt': 1,
        'discover_by': 'url',
    }]
    seen = {}

    def handler(request):
        seen.update(dict(request.url.params))
        return httpx.Response(200, json={'snapshot_id': 'url-profile'})

    collector = PagedInstagramCollector(
        session, checkpoint, httpx.Client(transport=httpx.MockTransport(handler)))
    with collector._managed() as managed:
        collector._trigger_one(managed)

    assert seen['dataset_id'] == PROFILE_DATASET
    assert 'type' not in seen
    assert 'discover_by' not in seen


def test_profile_enrichment_allowance_expands_with_each_results_page(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    checkpoint.update(query='brand research!', query_tasks=[], inputs=[], snapshots=[])
    collector = PagedInstagramCollector(session, checkpoint)

    collector.collect(target_results=100)

    assert checkpoint['profile_target'] == 100


def test_search_page_requests_metadata_for_all_fifty_accounts():
    from darkmap.schemas import InstagramSearchPageIn

    assert InstagramSearchPageIn(query='Brand').profile_limit == 50


def test_post_records_fill_profile_details_missing_from_search_snippets(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    checkpoint['organic'] = [{
        'link': 'https://www.instagram.com/reel/FOUND1/',
        'source': 'Instagram · regional.brand',
        'title': 'Brand regional post',
    }]
    collector = PagedInstagramCollector(session, checkpoint)
    checkpoint['records'][REEL_DATASET] = [{
        'url': 'https://www.instagram.com/reel/FOUND1/',
        'user_posted': 'regional.brand',
        'profile_name': 'Regional Brand',
        'followers': 2_500_000,
        'following': 17,
        'posts_count': 340,
        'is_verified': True,
        'profile_image_link': 'https://cdn.example/regional-brand.jpg',
    }]

    bundle = next(item for item in collector._bundles()[0]
                  if item.account.handle == 'regional.brand')

    assert bundle.account.display_name == 'Regional Brand'
    assert bundle.account.followers_count == 2_500_000
    assert bundle.account.follows_count == 17
    assert bundle.account.media_count == 340
    assert bundle.account.is_verified is True
    assert bundle.account.profile_pic_url == 'https://cdn.example/regional-brand.jpg'


def test_speculative_profiles_wait_behind_discovered_evidence(session, monkeypatch):
    enable(monkeypatch)
    checkpoint = state()
    collector = PagedInstagramCollector(session, checkpoint)

    collector._schedule()

    assert checkpoint['scheduled'][PROFILE_DATASET] == ['brand']


def test_pages_of_50_preserve_every_row_and_metadata_across_database_restarts(
        app_env, monkeypatch, tmp_path):
    enable(monkeypatch)
    from darkmap.api import app
    from darkmap import db
    calls = []

    def collect(self, target_results=50, budget=48):
        calls.append(target_results)
        if not self.state['records']:
            self.state['records'][PROFILE_DATASET] = [{
                'account': 'brand.research', 'followers': 432, 'full_name': 'Brand research',
                'biography': 'Product reviews', 'posts': [],
            }]
            self.state['records'][POST_DATASET] = [{
                'url': f'https://www.instagram.com/p/POST{i}/',
                'user_posted': 'brand.research', 'post_id': str(i),
                'description': f'Brand product review {i} #brand @brand',
                'image_url': f'https://cdn.example/{i}.jpg', 'likes': i,
                'latest_comments': [{'id': f'c{i}', 'username': 'reader', 'text': 'Useful review'}],
            } for i in range(106)]
        self.state['query_tasks'] = []
        self.state['queries_completed'] = 17
        return self._bundles()[0]

    monkeypatch.setattr(PagedInstagramCollector, 'collect', collect)
    cursor = None
    previous = set()
    results = []
    for page, expected in enumerate([50, 100, 107]):
        # A fresh DB simulates another invocation with none of the previous numeric IDs.
        monkeypatch.setenv('DARKMAP_DATABASE_URL', f'sqlite:///{tmp_path}/page{page}.db')
        reset_settings_cache()
        db.reset_engine()
        with TestClient(app) as client:
            response = client.post('/v1/instagram/search-page', json={
                'query': 'Brand', 'continuation': cursor, 'max_items': 250, 'profile_limit': 50})
            assert response.status_code == 200, response.text
            body = response.json()['result']
            results.append(body)
            for assessment in body['assessments']:
                assert isinstance(assessment['category_scores'], dict)
                assert isinstance(assessment['evidence'], list)
                assert isinstance(assessment['limitations'], list)
                assert isinstance(assessment['ai_available'], bool)
            hits = body['inline_search']['hits']
            keys = {hit_key(h) for h in hits}
            assert len(hits) == len(keys) == expected
            assert previous <= keys
            assert len(keys - previous) <= 50
            for hit in hits:
                assert hit['followers_count'] == 432
                if hit['doc_type'] == 'post':
                    assert hit['image_url'].startswith('https://cdn.example/')
                    assert hit['comments'][0]['text'] == 'Useful review'
                    assert hit['hashtags'] == ['brand']
            assert body['pagination']['has_more'] == (page < 2)
            cursor = body['pagination']['continuation']
            previous = keys
    assert cursor is None
    assert calls == [50, 100, 150]
    assert len(previous) == 107
    # Receiving another page cannot change a score when the underlying evidence is identical.
    for hit in results[0]['inline_search']['hits']:
        later = next(h for h in results[2]['inline_search']['hits'] if hit_key(h) == hit_key(hit))
        assert later['risk_score'] == hit['risk_score']


def test_pending_snapshots_queries_and_comments_survive_page_deadlines(session, monkeypatch):
    enable(monkeypatch)
    from darkmap.providers import instagram_pages as pages

    class Clock:
        now = time.time()

        def tick(self, seconds):
            self.now += seconds

    clock = Clock()
    monkeypatch.setattr(pages.time, 'monotonic', lambda: clock.now)
    monkeypatch.setattr(pages.time, 'time', lambda: clock.now)
    snapshots = {}
    submitted = []
    searches = []
    first_download = True

    def handler(request):
        nonlocal first_download
        clock.tick(2)
        if request.url.path == '/request':
            payload = json.loads(request.content)
            searches.append(payload)
            index = len(searches)
            return httpx.Response(200, json={'organic': [{
                'link': f'https://www.instagram.com/reel/FOUND{index}/',
                'source': f'Instagram · seller{index}',
                'title': f'Brand loot offer {index}',
            }]})
        if '/trigger' in request.url.path:
            payload = json.loads(request.content)
            dataset = request.url.params['dataset_id']
            for item in payload:
                identity = (dataset, json.dumps(item, sort_keys=True))
                assert identity not in submitted, 'A continuation triggered the same input twice'
                submitted.append(identity)
            sid = f'snap{len(snapshots)}'
            snapshots[sid] = (dataset, payload, clock.now)
            return httpx.Response(200, json={'snapshot_id': sid})
        sid = request.url.path.rsplit('/', 1)[-1]
        dataset, payload, created = snapshots[sid]
        if '/progress/' in request.url.path:
            return httpx.Response(200, json={'status': 'ready' if clock.now - created > 70 else 'running'})
        if first_download:
            first_download = False
            raise httpx.ReadTimeout('temporary read failure', request=request)
        if dataset == PROFILE_DATASET:
            rows = [dict(
                account=(i.get('user_name') or i['url'].rstrip('/').split('/')[-1]),
                followers=10, biography='Public profile',
                profile_image_link='https://cdn.example/profile.jpg') for i in payload]
        elif dataset == COMMENT_DATASET:
            rows = [dict(post_url=i['url'], comment_id='c' + i['url'],
                         comment='I paid but no delivery', comment_user='reviewer') for i in payload]
        else:
            rows = [dict(url=i['url'], user_posted='author' + i['url'].split('/')[-2],
                         description='Brand offer', image_url='https://cdn.example/cover.jpg') for i in payload]
        return httpx.Response(200, json=rows)

    checkpoint = state()
    client = httpx.Client(transport=httpx.MockTransport(handler))
    collector = PagedInstagramCollector(session, checkpoint, client, sleep=clock.tick)
    collector.collect(target_results=10000, budget=48)
    assert collector.has_work()
    assert checkpoint['snapshots']
    saved_ids = {s['id'] for s in checkpoint['snapshots']}
    assert not checkpoint['errors']  # Hitting a page deadline is not a source failure.
    for _ in range(30):
        checkpoint = decode_cursor(encode_cursor(checkpoint))
        collector = PagedInstagramCollector(session, checkpoint, client, sleep=clock.tick)
        bundles = collector.collect(target_results=10000, budget=48)
        if not collector.has_work():
            break
    assert not collector.has_work(), 'Collection must eventually exhaust instead of losing pending work'
    assert checkpoint['queries_completed'] == len(_discovery_queries('Brand')) == 17
    assert len(searches) == 17
    assert all(item['data_format'] == 'parsed' for item in searches[:5])
    assert all('num=20&filter=0' in item['url'] for item in searches[:5])
    assert saved_ids <= set(snapshots)
    assert len(checkpoint['records'][REEL_DATASET]) == 17
    assert len(checkpoint['records'][COMMENT_DATASET]) == 17
    assert any(p.comments for b in bundles for p in b.posts)
    assert not checkpoint['errors']


def test_malformed_cursor_cannot_launch_network_work(app_env, monkeypatch):
    enable(monkeypatch)
    from darkmap.api import app
    monkeypatch.setattr(PagedInstagramCollector, 'collect', lambda *a, **k: pytest.fail('network'))
    with TestClient(app) as client:
        response = client.post('/v1/instagram/search-page', json={'query': 'Brand', 'continuation': 'bad'})
        assert response.status_code == 400


def test_rate_limit_preserves_inputs_and_honors_retry_after(session, monkeypatch):
    enable(monkeypatch)
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(429, headers={'Retry-After': '90'}, text='Wait')

    checkpoint = state()
    client = httpx.Client(transport=httpx.MockTransport(handler))
    collector = PagedInstagramCollector(session, checkpoint, client)
    collector.collect(target_results=50)
    assert len(calls) == 1
    assert checkpoint['blocked_until'] > time.time() + 85
    assert len(checkpoint['query_tasks']) == 17
    assert checkpoint['inputs'] and checkpoint['inputs'][0]['attempt'] == 0
    assert checkpoint['quota'] and max(checkpoint['quota'].values()) == 1
    resumed = PagedInstagramCollector(session, decode_cursor(encode_cursor(checkpoint)), client)
    resumed.collect(target_results=50)
    assert len(calls) == 1  # Clicking View more during Retry-After cannot send another call.


@pytest.mark.parametrize('body', ['', 'null', '{}', '{"body":""}', '{"error":"upstream failure"}'])
def test_empty_gateway_response_is_not_a_completed_empty_search(body):
    from darkmap.http import Response
    from darkmap.providers.bright_data_instagram import _discovery_records
    with pytest.raises(ValueError):
        _discovery_records(Response(200, body, {}))
    assert _discovery_records(Response(200, '{"organic":[]}', {})) == []
    assert _discovery_records(Response(200, '{"body":{"organic":[]}}', {})) == []


def test_inactive_account_stops_once_and_preserves_work_for_explicit_retry(session, monkeypatch):
    enable(monkeypatch)
    calls = []
    active = False
    def handler(request):
        calls.append(request)
        if not active:
            return httpx.Response(400, text='Customer is not active')
        return httpx.Response(200, json={'snapshot_id': 'restored-snapshot'})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    checkpoint = state()
    collector = PagedInstagramCollector(session, checkpoint, client)
    assert collector.collect() == []
    assert len(calls) == 1
    assert checkpoint['source_error']['code'] == 'source_account_inactive'
    assert len(checkpoint['query_tasks']) == 17
    assert checkpoint['inputs'][0]['attempt'] == 0
    assert not checkpoint['errors']
    # Checkpoint can cross a cold start and still contains every original input.
    restored = decode_cursor(encode_cursor(checkpoint))
    active = True
    resumed = PagedInstagramCollector(session, restored, client)
    with resumed._managed() as managed:
        resumed._trigger_one(managed)
    assert restored['snapshots'][0]['id'] == 'restored-snapshot'
    assert len(calls) == 2


@pytest.mark.parametrize('scenario,expected_status,expected_outcome', [
    ('inactive','failed','blocked'), ('errors','failed','failed'),
    ('pending','succeeded','pending'), ('empty','succeeded','empty'),
    ('partial_blocked','succeeded','blocked'),
])
def test_page_outcome_matches_collection_evidence(app_env, monkeypatch, scenario, expected_status, expected_outcome):
    enable(monkeypatch)
    from darkmap.api import app
    def collect(self, target_results=50, budget=48):
        if scenario in ('inactive', 'partial_blocked'):
            self.state['source_error'] = {'code':'source_account_inactive', 'message':'The collection account is inactive. Reactivate it, then retry.'}
        if scenario == 'partial_blocked':
            self.state['records'][PROFILE_DATASET] = [{'account':'brand.research', 'followers':10}]
        if scenario in ('errors','empty'):
            self.state['query_tasks'] = []
            self.state['queries_completed'] = 0 if scenario=='errors' else 17
        if scenario=='errors':
            self.state['errors'] = [{'stage':'discovery','error':'blank response'}]
        return self._bundles()[0]
    monkeypatch.setattr(PagedInstagramCollector,'collect',collect)
    with TestClient(app) as client:
        response = client.post('/v1/instagram/search-page',json={'query':'Brand'})
    assert response.status_code == 200, response.text
    job = response.json()
    assert job['status'] == expected_status
    result = job['result']
    assert result['collection_outcome'] == expected_outcome
    assert result['pagination']['outcome'] == expected_outcome
    assert result['inline_search']['complete_collection'] == (scenario=='empty')
    assert bool(result['pagination']['continuation']) == (scenario in ('inactive','pending','partial_blocked'))
    assert bool(job['error']) == (scenario in ('inactive','errors','partial_blocked'))
    if scenario=='partial_blocked':
        assert len(result['inline_search']['hits']) == 1
