import httpx
import pytest

from darkmap import audit
from darkmap.providers.base import CollectionNotPermitted
from darkmap.providers.instagram_graph import InstagramGraphProvider
from darkmap.quota import QuotaExceeded


def _client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_account_scrape_paginates_business_discovery(session):
    requests = []

    def handler(request):
        requests.append(request)
        fields = request.url.params['fields']
        if '.after(CURSOR1)' in fields:
            media = {'data': [{
                'id': 'm2', 'username': 'target.brand', 'media_product_type': 'REELS',
                'caption': 'Second reel', 'timestamp': '2026-01-02T00:00:00Z',
            }]}
        else:
            media = {
                'data': [{'id': 'm1', 'username': 'target.brand', 'media_type': 'IMAGE',
                          'caption': 'First post', 'timestamp': '2026-01-01T00:00:00Z'}],
                'paging': {'cursors': {'after': 'CURSOR1'}},
            }
        return httpx.Response(200, json={'business_discovery': {
            'id': 'acct1', 'username': 'target.brand', 'name': 'Target Brand',
            'followers_count': 1000, 'media': media,
        }})

    provider = InstagramGraphProvider(
        session, {'mode': 'account', 'access_token': 'token', 'business_id': 'owner',
                  'max_items': 10, 'page_size': 1}, client=_client(handler))
    bundles = provider.fetch_many('target.brand')

    assert len(requests) == 2
    assert len(bundles) == 1
    assert bundles[0].account.handle == 'target.brand'
    assert [post.post_type for post in bundles[0].posts] == ['post', 'reel']
    assert bundles[0].provenance['collection_mode'] == 'account'
    assert all('access_token' not in bundle.provenance['endpoint'] for bundle in bundles)


def test_account_scrape_rejects_invalid_username_expression(session):
    provider = InstagramGraphProvider(
        session, {'mode': 'account', 'access_token': 'token', 'business_id': 'owner'},
        client=_client(lambda request: httpx.Response(500)))
    with pytest.raises(CollectionNotPermitted):
        provider.fetch_many('target){id,password}')


def test_owned_scrape_collects_authorized_comments_and_parent_ids(session):
    def handler(request):
        path = request.url.path
        if path.endswith('/owner/media'):
            return httpx.Response(200, json={'data': [{
                'id': 'm1', 'username': 'owned.brand', 'media_product_type': 'REELS',
                'caption': 'Owned reel', 'comments_count': 1,
            }]})
        if path.endswith('/m1/comments'):
            return httpx.Response(200, json={'data': [{
                'id': 'c2', 'parent_id': 'c1', 'username': 'commenter',
                'text': 'fake support replied here', 'like_count': 2,
                'timestamp': '2026-01-02T00:00:00Z',
            }]})
        return httpx.Response(200, json={
            'id': 'owner', 'username': 'owned.brand', 'name': 'Owned Brand'})

    provider = InstagramGraphProvider(
        session, {'mode': 'owned', 'access_token': 'token', 'business_id': 'owner',
                  'include_comments': True}, client=_client(handler))
    bundle = provider.fetch('')

    assert bundle.account.handle == 'owned.brand'
    assert bundle.posts[0].post_type == 'reel'
    comment = bundle.posts[0].comments[0]
    assert comment.platform_comment_id == 'c2'
    assert comment.parent_platform_comment_id == 'c1'
    assert comment.author_handle == 'commenter'


def test_hashtag_scrape_groups_public_media_by_account(session):
    def handler(request):
        if request.url.path.endswith('/ig_hashtag_search'):
            return httpx.Response(200, json={'data': [{'id': 'tag1'}]})
        return httpx.Response(200, json={'data': [
            {'id': 'm1', 'username': 'seller.one', 'caption': '#luminaire deal'},
            {'id': 'm2', 'username': 'seller.two', 'caption': '#luminaire support'},
            {'id': 'm3', 'username': 'seller.one', 'caption': '#luminaire replica'},
        ]})

    provider = InstagramGraphProvider(
        session, {'mode': 'hashtag_recent', 'access_token': 'token', 'business_id': 'owner'},
        client=_client(handler))
    bundles = provider.fetch_many('#luminaire')

    assert [bundle.account.handle for bundle in bundles] == ['seller.one', 'seller.two']
    assert [len(bundle.posts) for bundle in bundles] == [2, 1]
    assert all(bundle.provenance['collection_mode'] == 'hashtag_recent'
               for bundle in bundles)


def test_keyword_search_combines_live_hashtag_edges_and_enriches_profiles(session):
    def handler(request):
        path = request.url.path
        if path.endswith('/ig_hashtag_search'):
            return httpx.Response(200, json={'data': [{'id': 'tag1'}]})
        if path.endswith('/tag1/recent_media'):
            return httpx.Response(200, json={'data': [
                {'id': 'm1', 'username': 'seller.one', 'caption': '#luminaire offer'},
            ]})
        if path.endswith('/tag1/top_media'):
            return httpx.Response(200, json={'data': [
                {'id': 'm1', 'username': 'seller.one', 'caption': '#luminaire offer'},
                {'id': 'm2', 'username': 'seller.two', 'media_product_type': 'REELS',
                 'caption': 'luminaire reel @brand_help https://bad.example'},
            ]})
        fields = request.url.params.get('fields', '')
        username = 'seller.one' if 'seller.one' in fields else 'seller.two'
        return httpx.Response(200, json={'business_discovery': {
            'id': f'id-{username}', 'username': username,
            'name': f'Profile {username}', 'followers_count': 123,
        }})

    provider = InstagramGraphProvider(
        session, {'mode': 'keyword', 'access_token': 'token', 'business_id': 'owner',
                  'max_items': 20, 'profile_limit': 10}, client=_client(handler))
    bundles = provider.fetch_many('luminaire')

    assert [bundle.account.handle for bundle in bundles] == ['seller.one', 'seller.two']
    assert [bundle.account.display_name for bundle in bundles] == [
        'Profile seller.one', 'Profile seller.two']
    assert [len(bundle.posts) for bundle in bundles] == [1, 1]
    assert bundles[1].posts[0].post_type == 'reel'
    assert all(bundle.provenance['collection_mode'] == 'keyword' for bundle in bundles)


def test_hashtag_scrape_stops_before_31st_unique_query(session):
    for index in range(30):
        audit.record(session, action='instagram.hashtag_query', provider='instagram_graph',
                     target=f'tag{index}', actor='ig-user:owner', status='ok',
                     lawful_basis='official_api')
    called = []
    client = _client(lambda request: called.append(request))
    provider = InstagramGraphProvider(
        session, {'mode': 'hashtag_recent', 'access_token': 'token', 'business_id': 'owner'},
        client=client)

    with pytest.raises(QuotaExceeded) as caught:
        provider.fetch_many('new_unique_tag')

    assert caught.value.window == 'rolling_7_days'
    assert called == []
