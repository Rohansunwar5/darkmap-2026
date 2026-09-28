import json

import httpx
import pytest

from darkmap.providers import get_provider
from darkmap.providers.base import CollectionNotPermitted, ProviderNotConfigured


def test_export_file_provider_inline_document(session):
    doc = {
        'account': {'handle': 'inline.user', 'biography': 'hello world'},
        'posts': [{'id': 'p1', 'caption': 'test caption', 'posted_at': '2024-01-01T00:00:00Z'}],
    }
    provider = get_provider('export_file', session, {'document': doc})
    bundle = provider.fetch('inline.user')
    assert bundle.account.handle == 'inline.user'
    assert len(bundle.posts) == 1
    assert bundle.provenance['lawful_basis'] == 'user_export'


def test_export_file_missing_params(session):
    provider = get_provider('export_file', session, {})
    with pytest.raises(ProviderNotConfigured):
        provider.check_configuration()


def test_public_page_requires_allowlist(session, monkeypatch):
    provider = get_provider('public_page', session,
                            {'url': 'https://not-allowed.example/profile'})
    with pytest.raises(CollectionNotPermitted):
        provider.fetch('someone')
