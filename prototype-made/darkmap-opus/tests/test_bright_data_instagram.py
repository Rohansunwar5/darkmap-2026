import json

import httpx
from fastapi.testclient import TestClient

from darkmap.config import reset_settings_cache
from darkmap.providers.bright_data_instagram import (BrightDataInstagramProvider,
                                                     _as_int, _discovery_queries,
                                                     _response_payload)
from darkmap.providers.base import RawAccount, RawBundle, RawMedia, RawPost


def test_response_payload_accepts_bright_data_ndjson():
    class Response:
        text = '{"url":"https://www.instagram.com/p/one/"}\n' \
               '{"url":"https://www.instagram.com/reel/two/"}\n'

    assert [item['url'] for item in _response_payload(Response())] == [
        'https://www.instagram.com/p/one/',
        'https://www.instagram.com/reel/two/',
    ]


def test_primary_brand_discovery_runs_before_broad_threat_tail():
    queries = _discovery_queries('Netflix')

    assert queries[7] == ('site:instagram.com "Netflix"', 'in')
    assert len(queries) == 17


def test_post_uses_comments_embedded_in_dataset_record():
    post = BrightDataInstagramProvider._post({
        'url': 'https://www.instagram.com/p/POST1/',
        'description': 'Brand offer',
        'latest_comments': [{
            'id': 'c1', 'username': 'victim.one',
            'text': 'I paid but the order never arrived', 'likes': 3,
        }],
    })

    assert len(post.comments) == 1
    assert post.comments[0].author_handle == 'victim.one'
    assert post.comments[0].text == 'I paid but the order never arrived'
    assert post.comments[0].like_count == 3


def test_account_reads_avatar_and_metrics_from_nested_author_shape():
    account = BrightDataInstagramProvider._account({
        'user_posted': 'brand.helper',
        'owner': {
            'username': 'brand.helper',
            'full_name': 'Brand Helper',
            'profile_picture_url': {'url': 'https://cdn.example/helper.jpg'},
            'followers_count': {'count': '1,234'},
            'following_count': {'value': 27},
            'post_count': {'total': 81},
        },
    }, 'brand.helper')

    assert account.handle == 'brand.helper'
    assert account.display_name == 'Brand Helper'
    assert account.profile_pic_url == 'https://cdn.example/helper.jpg'
    assert account.followers_count == 1234
    assert account.follows_count == 27
    assert account.media_count == 81


def test_public_counter_abbreviations_are_normalized():
    assert _as_int('12.4K') == 12_400
    assert _as_int('3.1M followers') == 3_100_000
    assert _as_int('1,234 followers') == 1_234


def test_account_reads_alternate_author_avatar_and_follower_fields():
    account = BrightDataInstagramProvider._account({
        'user_posted': 'brand.helper',
        'author': {
            'owner_profile_picture_url': 'https://cdn.example/alternate.jpg',
            'edge_followed_by_count': '81.5K',
        },
    }, 'brand.helper')

    assert account.profile_pic_url == 'https://cdn.example/alternate.jpg'
    assert account.followers_count == 81_500


def test_reel_mp4_in_image_field_is_not_exposed_as_an_image():
    post = BrightDataInstagramProvider._post({
        'url': 'https://www.instagram.com/reel/VIDEO1/',
        'user_posted': 'brand.helper',
        'image_url': 'https://cdn.example/reel.mp4?token=signed',
    })

    assert len(post.media) == 1
    assert post.media[0].media_type == 'video'
    assert post.media[0].media_url.startswith('https://cdn.example/reel.mp4')
    assert post.media[0].thumbnail_url is None


def _enable(monkeypatch):
    monkeypatch.setenv('BRIGHT_DATA_API_KEY', 'bright-test-key')
    monkeypatch.setenv('BRIGHT_DATA_SERP_ZONE', 'darkmap_serp')
    reset_settings_cache()


def test_account_collection_uses_bright_data_key_and_normalizes_profile(session, monkeypatch):
    _enable(monkeypatch)
    seen = {}

    def handler(request):
        if request.url.path == '/datasets/v3/trigger':
            seen['auth'] = request.headers.get('authorization')
            seen['params'] = dict(request.url.params)
            seen['body'] = json.loads(request.content)
            return httpx.Response(200, json={'snapshot_id': 'profile-1'})
        if request.url.path.endswith('/progress/profile-1'):
            return httpx.Response(200, json={'status': 'ready'})
        return httpx.Response(200, json=[{
            'account': 'brand.support', 'id': '123', 'full_name': 'Brand Support',
            'biography': 'Help at https://brand.example/support', 'followers': 440,
            'following': 10, 'posts_count': 1, 'is_verified': False,
            'external_url': ['https://brand.example/support'],
            'profile_image_link': 'https://cdn.example/avatar.jpg',
            'posts': [{
                'id': '900', 'caption': 'Contact @brand #help',
                'datetime': '2026-09-12T01:00:00.000Z',
                'content_type': 'Video', 'likes': 12, 'comments': 3,
                'url': 'https://www.instagram.com/reel/ABC123/',
                'image_url': 'https://cdn.example/cover.jpg',
                'video_url': 'https://cdn.example/video.mp4',
            }],
        }])

    provider = BrightDataInstagramProvider(
        session, {'mode': 'account', 'include_comments': False},
        client=httpx.Client(transport=httpx.MockTransport(handler)))
    bundles = provider.fetch_many('@brand.support')

    assert seen['auth'] == 'Bearer bright-test-key'
    assert bundles[0].account.external_url == 'https://brand.example/support'
    assert seen['params']['dataset_id'] == 'gd_l1vikfch901nx3by4'
    assert seen['params']['discover_by'] == 'user_name'
    assert seen['body'] == [{'user_name': 'brand.support'}]
    assert bundles[0].account.display_name == 'Brand Support'
    assert bundles[0].account.followers_count == 440
    assert bundles[0].posts[0].post_type == 'reel'
    assert bundles[0].posts[0].media[1].media_type == 'video'
    assert bundles[0].provenance['provider'] == 'bright_data_instagram'


def test_keyword_discovers_only_valid_instagram_urls_and_groups_authors(session, monkeypatch):
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '50')
    _enable(monkeypatch)
    seen_inputs = []
    snapshots = {}

    def handler(request):
        if request.url.path == '/request':
            return httpx.Response(200, json={'organic': [
                {'link': 'https://www.instagram.com/p/POST1/?utm_source=google'},
                {'link': 'https://instagram.com/reel/REEL1/'},
                {'link': 'https://www.instagram.com/suspect.support/'},
                {'link': 'https://evil.example/instagram.com/p/NOPE'},
            ]})
        if request.url.path == '/datasets/v3/trigger':
            body = json.loads(request.content)
            seen_inputs.extend(item['url'] for item in body if 'url' in item)
            dataset = request.url.params.get('dataset_id')
            snapshot = f'snapshot-{dataset}'
            snapshots[snapshot] = dataset
            return httpx.Response(200, json={'snapshot_id': snapshot})
        if '/progress/' in request.url.path:
            return httpx.Response(200, json={'status': 'ready'})
        snapshot = request.url.path.rsplit('/', 1)[-1]
        dataset = snapshots[snapshot]
        if dataset == 'gd_l1vikfch901nx3by4':
            return httpx.Response(200, json=[{
                'account': 'suspect.support', 'full_name': 'Suspect Support',
                'biography': 'DM us', 'posts': [],
            }])
        if dataset == 'gd_lk5ns7kz21pck8jpis':
            return httpx.Response(200, json=[{
                'url': 'https://www.instagram.com/p/POST1/', 'user_posted': 'seller.one',
                'description': 'Brand sale #brand', 'post_id': '1', 'likes': 4,
            }])
        return httpx.Response(200, json=[{
            'url': 'https://www.instagram.com/reel/REEL1/', 'user_posted': 'seller.two',
            'description': 'Brand giveaway @brand', 'post_id': '2', 'views': 50,
        }])

    provider = BrightDataInstagramProvider(
        session, {'mode': 'keyword', 'include_comments': False, 'profile_limit': 5},
        client=httpx.Client(transport=httpx.MockTransport(handler)))
    bundles = provider.fetch_many('Brand Name')

    assert set(seen_inputs) == {
        'https://www.instagram.com/p/POST1/',
        'https://www.instagram.com/reel/REEL1/',
    }
    assert {bundle.account.handle for bundle in bundles} == {
        'seller.one', 'seller.two', 'suspect.support'}
    assert sum(len(bundle.posts) for bundle in bundles) == 2


def test_keyword_keeps_profile_when_reel_trigger_times_out(session, monkeypatch):
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '50')
    _enable(monkeypatch)

    def handler(request):
        if request.url.path == '/request':
            return httpx.Response(200, json={'organic': [
                {'link': 'https://www.instagram.com/seller.one/'},
                {'link': 'https://www.instagram.com/reel/REEL1/'},
            ]})
        if request.url.path == '/datasets/v3/trigger':
            dataset = request.url.params.get('dataset_id')
            if dataset == 'gd_lyclm20il4r5helnj':
                raise httpx.ReadTimeout('reel trigger timed out', request=request)
            return httpx.Response(200, json={'snapshot_id': 'profile-1'})
        if '/progress/' in request.url.path:
            return httpx.Response(200, json={'status': 'ready'})
        return httpx.Response(200, json=[{
            'account': 'seller.one', 'full_name': 'Seller One',
        }])

    provider = BrightDataInstagramProvider(
        session, {'mode': 'keyword', 'include_comments': False, 'profile_limit': 2},
        client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda _: None)
    bundles = provider.fetch_many('Brand Name')

    assert len(bundles) == 1
    assert bundles[0].account.handle == 'seller.one'
    assert bundles[0].account.display_name == 'Seller One'


def test_threat_serp_preserves_author_post_and_thumbnail_when_dataset_times_out(
        session, monkeypatch):
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '50')
    _enable(monkeypatch)
    formats = []
    requests = 0

    def handler(request):
        nonlocal requests
        if request.url.path == '/request':
            requests += 1
            body = json.loads(request.content)
            formats.append(body['data_format'])
            if requests == 1:
                return httpx.Response(200, content=b'')
            return httpx.Response(200, json={'organic': [{
                'link': 'https://www.instagram.com/reel/DY7HQHHglVD/',
                'source': 'Instagram · shopaholics80club',
                'title': 'Lenskart 100₹ frame loot Link in my telegram channel',
                'description': '@lenskart #lenskart #shopping #loot',
                'image': 'data:image/jpeg;base64,YWJj',
            }]})
        if request.url.path == '/datasets/v3/trigger':
            dataset = request.url.params.get('dataset_id')
            if dataset in {'gd_lk5ns7kz21pck8jpis', 'gd_lyclm20il4r5helnj'}:
                raise httpx.ReadTimeout('media snapshot unavailable', request=request)
            return httpx.Response(200, json={'snapshot_id': 'profiles'})
        if '/progress/' in request.url.path:
            return httpx.Response(200, json={'status': 'ready'})
        return httpx.Response(200, json=[])

    provider = BrightDataInstagramProvider(
        session, {'mode': 'keyword', 'include_comments': False, 'profile_limit': 5},
        client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda _: None)
    bundles = provider.fetch_many('Lenskart')

    result = next(bundle for bundle in bundles
                  if bundle.account.handle == 'shopaholics80club')
    assert formats[:6] == ['parsed'] * 6
    assert requests == len(_discovery_queries('Lenskart')) + 1
    assert '100₹ frame loot' in result.posts[0].caption
    assert result.posts[0].permalink.endswith('/DY7HQHHglVD/')
    assert result.posts[0].media[0].thumbnail_url == 'data:image/jpeg;base64,YWJj'
    assert sum(post.permalink.endswith('/DY7HQHHglVD/')
               for bundle in bundles for post in bundle.posts) == 1


def test_keyword_empty_serp_falls_back_to_exact_profile(session, monkeypatch):
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '50')
    _enable(monkeypatch)
    seen = {'bodies': [], 'serp_urls': []}

    def handler(request):
        if request.url.path == '/request':
            seen['serp_urls'].append(json.loads(request.content)['url'])
            return httpx.Response(200, json={'organic': []})
        if request.url.path == '/datasets/v3/trigger':
            seen['params'] = dict(request.url.params)
            seen['bodies'].append(json.loads(request.content))
            return httpx.Response(200, json={'snapshot_id': 'amazon-profile'})
        if '/progress/' in request.url.path:
            return httpx.Response(200, json={'status': 'ready'})
        return httpx.Response(200, json=[{
            'account': 'amazon', 'full_name': 'Amazon',
            'profile_image_link': 'https://cdn.example/amazon.jpg',
            'posts': [{
                'id': 'post-1', 'url': 'https://www.instagram.com/p/AMAZON1/',
                'description': 'Amazon delivery update',
                'image_url': 'https://cdn.example/post.jpg',
            }],
        }])

    provider = BrightDataInstagramProvider(
        session, {'mode': 'keyword', 'include_comments': False, 'profile_limit': 5},
        client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda _: None)
    bundles = provider.fetch_many('Amazon')

    assert seen['params']['dataset_id'] == 'gd_l1vikfch901nx3by4'
    assert seen['params']['discover_by'] == 'user_name'
    assert {'user_name': 'amazon.support'} in seen['bodies'][0]
    assert {'user_name': 'amazon'} in seen['bodies'][1]
    candidates = {item['user_name'] for body in seen['bodies'] for item in body}
    assert {'amazon', 'amazon.official', 'amazon.support'} <= candidates
    assert len(seen['serp_urls']) == len(_discovery_queries('Amazon')) + 5
    assert any('instagram.com%2Fp%2F' in url for url in seen['serp_urls'])
    assert any('instagram.com%2Freel%2F' in url for url in seen['serp_urls'])
    assert any('gl=in' in url for url in seen['serp_urls'])
    assert any('gl=us' in url for url in seen['serp_urls'])
    assert any('customer+care' in url for url in seen['serp_urls'])
    assert any('giveaway' in url for url in seen['serp_urls'])
    assert any('whatsapp' in url for url in seen['serp_urls'])
    assert any('telegram' in url for url in seen['serp_urls'])
    assert any('%22loot%22' in url for url in seen['serp_urls'])
    assert all('num=20' in url and 'filter=0' in url for url in seen['serp_urls'][:5])
    assert any('%22claim%22' in url for url in seen['serp_urls'])
    assert any('login' in url for url in seen['serp_urls'])
    assert any('discount' in url for url in seen['serp_urls'])
    assert any('scam' in url for url in seen['serp_urls'])
    assert bundles[0].account.handle == 'amazon'
    assert bundles[0].account.profile_pic_url == 'https://cdn.example/amazon.jpg'
    assert len(bundles[0].posts) == 1


def test_discovery_queries_prioritize_actionable_abuse_before_general_mentions():
    queries = _discovery_queries('Lenskart')
    texts = [query for query, _ in queries]

    assert 'instagram.com/reel/' in texts[0] and '"telegram channel"' in texts[0]
    assert 'instagram.com/reel/' in texts[1] and '"loot"' in texts[1]
    assert 'instagram.com/reel/' in texts[2] and '"free cash"' in texts[2]
    assert 'instagram.com/p/' in texts[3] and '"telegram"' in texts[3]
    assert '"Lenskart_support"' in texts[6]
    assert texts[7] == 'site:instagram.com "Lenskart"'
    assert '"support"' in texts[8] and '"whatsapp"' in texts[8]
    assert any('"OTP"' in query for query in texts[:11])
    assert all(country == 'in' for _, country in queries[:-1])
    assert queries[-1][1] == 'us'


def test_instagram_endpoint_auto_selects_bright_data(app_env, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.delenv('DARKMAP_IG_ACCESS_TOKEN', raising=False)
    monkeypatch.delenv('DARKMAP_IG_BUSINESS_ID', raising=False)
    reset_settings_cache()
    from darkmap.api import app

    with TestClient(app) as client:
        response = client.post('/v1/instagram/scrape', json={
            'mode': 'keyword', 'query': 'brand', 'max_items': 25,
            'include_comments': False, 'analyze': False,
        })
        assert response.status_code == 202
        assert response.json()['payload']['provider'] == 'bright_data_instagram'
        duplicate = client.post('/v1/instagram/scrape', json={
            'mode': 'keyword', 'query': 'brand', 'max_items': 25,
            'include_comments': False, 'analyze': False,
        })
        assert duplicate.json()['id'] == response.json()['id']
        health = client.get('/healthz').json()
        assert health['instagram_alternative']['keyword_search_configured'] is True


def test_vercel_search_returns_terminal_job_with_inline_results(app_env, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.delenv('DARKMAP_IG_ACCESS_TOKEN', raising=False)
    monkeypatch.delenv('DARKMAP_IG_BUSINESS_ID', raising=False)
    reset_settings_cache()

    def fetch_many(_provider, _query):
        return [RawBundle(
            account=RawAccount(
                handle='lenskart.help', display_name='Lenskart Help',
                biography='Lenskart customer giveaway support',
                profile_pic_url='https://cdn.example/profile.jpg',
                followers_count=1200, is_verified=True),
            posts=[RawPost(
                platform_post_id='post-1', shortcode='POST1',
                caption='Lenskart sale #lenskart — mention @lenskart',
                permalink='https://www.instagram.com/p/POST1/', like_count=42,
                media=[RawMedia(media_type='image',
                                media_url='https://cdn.example/post.jpg')])],
            provenance={
                'provider': 'bright_data_instagram',
                'lawful_basis': 'licensed_public_data_api',
                'collection_mode': 'keyword',
            },
        )]

    monkeypatch.setattr(BrightDataInstagramProvider, 'fetch_many', fetch_many)
    from darkmap.api import app

    try:
        with TestClient(app) as client:
            response = client.post('/v1/instagram/scrape', json={
                'mode': 'keyword', 'query': 'lenskart', 'max_items': 25,
                'include_comments': False, 'analyze': True,
            })

        assert response.status_code == 202
        job = response.json()
        assert job['status'] == 'succeeded'
        assert job['attempts'] == 1
        assert job['result']['serverless_inline'] is True
        assert job['result']['analysis_mode'] == 'heuristics_inline'
        assert job['result']['assessments'][0]['assessment_id']
        assert job['result']['assessments'][0]['alert_families']
        assert set(job['result']['assessments'][0]['dimensions']) == {
            'deception', 'harm', 'exposure', 'coordination'}
        assert 'top_evidence' in job['result']['assessments'][0]
        assert job['result']['inline_search']['total'] == 2
        assert job['result']['inline_search']['complete_collection'] is True
        assert job['result']['inline_search']['query'] == 'lenskart'
        assert job['result']['inline_search']['facets']['accounts'] == 1
        assert job['result']['inline_search']['facets']['posts'] == 1
        assert all(hit['risk_score'] is not None
                   for hit in job['result']['inline_search']['hits'])
        account = next(hit for hit in job['result']['inline_search']['hits']
                       if hit['doc_type'] == 'account')
        assert account['risk_score'] >= 85
        assert job['payload']['brand_id'] is not None
        post = next(hit for hit in job['result']['inline_search']['hits']
                    if hit['doc_type'] == 'post')
        assert post['instagram_url'] == 'https://www.instagram.com/p/POST1/'
        assert post['image_url'] == 'https://cdn.example/post.jpg'
        assert post['like_count'] == 42
        assert 'Lenskart sale' in post['content']
        assert post['hashtags'] == ['lenskart']
        assert post['mentions'] == ['lenskart']
        assert post['media'][0]['url'] == 'https://cdn.example/post.jpg'
        assert post['provenance']['provider'] == 'bright_data_instagram'
    finally:
        monkeypatch.delenv('VERCEL', raising=False)
        monkeypatch.delenv('BRIGHT_DATA_API_KEY', raising=False)
        monkeypatch.delenv('BRIGHT_DATA_SERP_ZONE', raising=False)
        reset_settings_cache()
