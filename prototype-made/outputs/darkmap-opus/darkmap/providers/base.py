'''Swappable ingestion provider interface + provider-neutral raw containers.'''
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session


@dataclass
class RawMedia:
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_seconds: Optional[float] = None
    mime_type: Optional[str] = None
    byte_size: Optional[int] = None
    perceptual_hash: Optional[str] = None
    ocr_text: Optional[str] = None
    transcript: Optional[str] = None
    qr_payloads: List[str] = field(default_factory=list)
    brand_match_score: Optional[float] = None
    synthetic_media_score: Optional[float] = None
    exif: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RawComment:
    platform_comment_id: Optional[str] = None
    parent_platform_comment_id: Optional[str] = None
    author_handle: Optional[str] = None
    text: Optional[str] = None
    like_count: Optional[int] = None
    created_at: Optional[dt.datetime] = None


@dataclass
class RawPost:
    platform_post_id: Optional[str] = None
    shortcode: Optional[str] = None
    post_type: str = 'post'
    permalink: Optional[str] = None
    caption: Optional[str] = None
    posted_at: Optional[dt.datetime] = None
    like_count: Optional[int] = None
    comment_count: Optional[int] = None
    view_count: Optional[int] = None
    share_count: Optional[int] = None
    language: Optional[str] = None
    media: List[RawMedia] = field(default_factory=list)
    comments: List[RawComment] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RawAccount:
    handle: str
    platform: str = 'instagram'
    platform_account_id: Optional[str] = None
    display_name: Optional[str] = None
    biography: Optional[str] = None
    external_url: Optional[str] = None
    profile_pic_url: Optional[str] = None
    is_verified: Optional[bool] = None
    is_business: Optional[bool] = None
    followers_count: Optional[int] = None
    follows_count: Optional[int] = None
    media_count: Optional[int] = None
    account_created_at: Optional[dt.datetime] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RawBundle:
    account: RawAccount
    posts: List[RawPost] = field(default_factory=list)
    provenance: Dict[str, Any] = field(default_factory=dict)


class ProviderError(Exception):
    pass


class ProviderNotConfigured(ProviderError):
    pass


class CollectionNotPermitted(ProviderError):
    '''Raised when the requested collection is outside Darkmap's authorized scope.'''


class IngestionProvider:
    '''Implement this to add a compliant data source.

    `lawful_basis` documents *why* the collection is permitted and is written to every
    audit record produced by the provider.
    '''

    name: str = 'base'
    lawful_basis: str = 'unspecified'

    def __init__(self, session: Session, params: Optional[Dict[str, Any]] = None):
        self.session = session
        self.params = params or {}

    def check_configuration(self) -> None:
        '''Raise ProviderNotConfigured if credentials / inputs are missing.'''

    def fetch(self, handle: str) -> RawBundle:
        raise NotImplementedError

    def fetch_many(self, handle: str) -> List[RawBundle]:
        '''Return one or more account bundles for discovery providers.'''
        return [self.fetch(handle)]
