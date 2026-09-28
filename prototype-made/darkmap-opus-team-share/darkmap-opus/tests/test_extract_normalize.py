import datetime as dt

from darkmap.extract import domain_of, extract
from darkmap.normalize import ingest_bundle
from darkmap.providers.base import RawAccount, RawBundle, RawComment, RawMedia, RawPost


def test_extract_entities():
    text = ('Win now! visit https://bit.ly/abc and www.lumi-outlet.xyz #Giveaway '
            '@luminaire contact help@evil.top cashapp $lumiclaims')
    found = extract(text)
    assert 'giveaway' in found['hashtag']
    assert 'luminaire' in found['mention']
    assert any('bit.ly' in u for u in found['url'])
    assert any('lumi-outlet.xyz' in u for u in found['url'])
    assert 'help@evil.top' in found['email']
    assert found['payment']


def test_domain_of():
    assert domain_of('https://www.Luminaire.com/path') == 'luminaire.com'
    assert domain_of('bit.ly/abc') == 'bit.ly'
    assert domain_of('') == ''


def test_extracts_bare_telegram_invite():
    found = extract('Join our Lenskart loot deal channel: t.me/lenskart_loot')
    assert found['url'] == ['t.me/lenskart_loot']


def test_ingest_bundle_is_idempotent(session):
    bundle = RawBundle(
        account=RawAccount(handle='TestBrandShop', display_name='Test Brand Shop',
                           biography='Shop now at www.test-shop.xyz #deal',
                           external_url='http://www.test-shop.xyz'),
        posts=[RawPost(platform_post_id='p1', caption='Replica lamps #luminaire @luminaire',
                       posted_at=dt.datetime(2024, 5, 1),
                       media=[RawMedia(media_type='image', width=10, height=10)],
                       comments=[RawComment(platform_comment_id='c1', author_handle='bot1',
                                            text='dm for price')])],
        provenance={'provider': 'export_file', 'lawful_basis': 'user_export'})

    first = ingest_bundle(session, bundle)
    second = ingest_bundle(session, bundle)
    session.commit()

    assert first['account_id'] == second['account_id']
    from sqlalchemy import func, select
    from darkmap.models import Comment, Entity, MediaAsset, Post, SearchDocument
    assert session.scalar(select(func.count()).select_from(Post)) == 1
    assert session.scalar(select(func.count()).select_from(MediaAsset)) == 1
    assert session.scalar(select(func.count()).select_from(Comment)) == 1
    assert session.scalar(select(func.count()).select_from(SearchDocument)) == 2
    kinds = {e.kind for e in session.scalars(select(Entity)).all()}
    assert {'hashtag', 'mention', 'url'} <= kinds


def test_missing_verification_metadata_remains_unknown(session):
    result = ingest_bundle(session, RawBundle(account=RawAccount(handle='partial.profile')))
    from darkmap.models import Account

    account = session.get(Account, result['account_id'])
    assert account.is_verified is None
    assert account.is_business is None
