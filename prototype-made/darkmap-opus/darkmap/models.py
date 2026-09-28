'''Normalized Darkmap schema.'''
import datetime as dt
import uuid

from sqlalchemy import (JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import relationship

from .db import Base


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


class Brand(Base):
    __tablename__ = 'brands'
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False, unique=True)
    official_handles = Column(JSON, default=list)      # ['luminaire']
    official_domains = Column(JSON, default=list)      # ['luminaire.com']
    keywords = Column(JSON, default=list)              # product lines, taglines
    created_at = Column(DateTime, default=utcnow)


class Account(Base):
    __tablename__ = 'accounts'
    id = Column(Integer, primary_key=True)
    platform = Column(String(40), default='instagram', nullable=False)
    platform_account_id = Column(String(120))
    handle = Column(String(200), nullable=False)
    handle_lower = Column(String(200), nullable=False, index=True)
    display_name = Column(String(300))
    biography = Column(Text)
    external_url = Column(Text)
    profile_pic_url = Column(Text)
    # Absence in a partial profile response means unknown, not false.  Keeping this nullable
    # prevents incomplete collection from presenting established accounts as unverified.
    is_verified = Column(Boolean)
    is_business = Column(Boolean)
    followers_count = Column(Integer)
    follows_count = Column(Integer)
    media_count = Column(Integer)
    account_created_at = Column(DateTime)
    first_seen_at = Column(DateTime, default=utcnow)
    last_seen_at = Column(DateTime, default=utcnow)
    brand_id = Column(Integer, ForeignKey('brands.id'))
    latest_risk_score = Column(Float)
    latest_action = Column(String(40))
    provenance = Column(JSON, default=dict)
    raw = Column(JSON, default=dict)

    posts = relationship('Post', back_populates='account', cascade='all, delete-orphan')
    assessments = relationship('RiskAssessment', back_populates='account',
                               cascade='all, delete-orphan')
    brand = relationship('Brand')

    __table_args__ = (UniqueConstraint('platform', 'handle_lower', name='uq_account_platform_handle'),)


class Post(Base):
    __tablename__ = 'posts'
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False)
    platform_post_id = Column(String(160))
    shortcode = Column(String(80))
    post_type = Column(String(30), default='post')   # post | reel | story | carousel
    permalink = Column(Text)
    caption = Column(Text)
    caption_lower = Column(Text)
    posted_at = Column(DateTime, index=True)
    like_count = Column(Integer)
    comment_count = Column(Integer)
    view_count = Column(Integer)
    share_count = Column(Integer)
    language = Column(String(16))
    provenance = Column(JSON, default=dict)
    raw = Column(JSON, default=dict)
    ingested_at = Column(DateTime, default=utcnow)

    account = relationship('Account', back_populates='posts')
    media = relationship('MediaAsset', back_populates='post', cascade='all, delete-orphan')
    comments = relationship('Comment', back_populates='post', cascade='all, delete-orphan')

    __table_args__ = (
        UniqueConstraint('account_id', 'platform_post_id', name='uq_post_account_platform_id'),
        Index('ix_posts_account_posted', 'account_id', 'posted_at'),
    )


class MediaAsset(Base):
    __tablename__ = 'media_assets'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='CASCADE'), nullable=False)
    media_type = Column(String(30))        # image | video | audio
    media_url = Column(Text)
    thumbnail_url = Column(Text)
    width = Column(Integer)
    height = Column(Integer)
    duration_seconds = Column(Float)
    mime_type = Column(String(80))
    byte_size = Column(Integer)
    perceptual_hash = Column(String(80))   # filled when media analysis is available
    ocr_text = Column(Text)                # provided by export / media pipeline only
    exif = Column(JSON, default=dict)
    provenance = Column(JSON, default=dict)

    post = relationship('Post', back_populates='media')


class Comment(Base):
    __tablename__ = 'comments'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='CASCADE'), nullable=False)
    platform_comment_id = Column(String(160))
    parent_platform_comment_id = Column(String(160), index=True)
    author_handle = Column(String(200))
    text = Column(Text)
    text_lower = Column(Text)
    like_count = Column(Integer)
    created_at = Column(DateTime)
    provenance = Column(JSON, default=dict)

    post = relationship('Post', back_populates='comments')


class Entity(Base):
    '''Extracted hashtags / mentions / urls / emails / payment handles.'''
    __tablename__ = 'entities'
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), index=True)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='CASCADE'), index=True)
    comment_id = Column(Integer, ForeignKey('comments.id', ondelete='CASCADE'))
    kind = Column(String(30), nullable=False, index=True)   # hashtag|mention|url|email|payment
    value = Column(String(600), nullable=False)
    value_lower = Column(String(600), nullable=False, index=True)
    domain = Column(String(300), index=True)
    source_field = Column(String(40))      # caption|bio|comment|external_url
    created_at = Column(DateTime, default=utcnow)


class SearchDocument(Base):
    '''Denormalized search index row (portable across SQLite/PostgreSQL).'''
    __tablename__ = 'search_documents'
    id = Column(Integer, primary_key=True)
    doc_type = Column(String(20), nullable=False, index=True)   # account | post
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), index=True)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='CASCADE'))
    handle = Column(String(200), index=True)
    title = Column(String(400))
    body = Column(Text)
    body_lower = Column(Text)
    hashtags = Column(JSON, default=list)
    mentions = Column(JSON, default=list)
    domains = Column(JSON, default=list)
    risk_score = Column(Float, index=True)
    posted_at = Column(DateTime, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint('doc_type', 'account_id', 'post_id', name='uq_search_doc'),)


class RiskAssessment(Base):
    __tablename__ = 'risk_assessments'
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False,
                        index=True)
    brand_id = Column(Integer, ForeignKey('brands.id'))
    overall_score = Column(Float, nullable=False)
    category_scores = Column(JSON, default=dict)
    dimensions = Column(JSON, default=dict)
    alert_families = Column(JSON, default=dict)
    independent_indicators = Column(Integer, default=0)
    evidence = Column(JSON, default=list)
    confidence = Column(Float, default=0.5)
    limitations = Column(JSON, default=list)
    recommended_action = Column(String(40))
    summary = Column(Text)
    heuristic_score = Column(Float)
    ai_score = Column(Float)
    ai_available = Column(Boolean, default=False)
    model = Column(String(80))
    engine_version = Column(String(40))
    created_at = Column(DateTime, default=utcnow, index=True)

    account = relationship('Account', back_populates='assessments')


class Job(Base):
    __tablename__ = 'jobs'
    id = Column(Integer, primary_key=True)
    public_id = Column(String(40), default=new_id, unique=True, index=True)
    kind = Column(String(40), nullable=False)         # ingest | analyze
    status = Column(String(20), default='queued', index=True)
    payload = Column(JSON, default=dict)
    result = Column(JSON, default=dict)
    error = Column(Text)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    available_at = Column(DateTime, default=utcnow, index=True)
    locked_at = Column(DateTime)
    locked_by = Column(String(80))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    '''Append-only record of every external call and every consequential action.'''
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True)
    at = Column(DateTime, default=utcnow, index=True)
    actor = Column(String(80), default='system')
    action = Column(String(80), nullable=False, index=True)
    provider = Column(String(60))
    target = Column(String(400))
    status = Column(String(40))
    lawful_basis = Column(String(80))     # official_api | user_export | permitted_public_page
    duration_ms = Column(Integer)
    detail = Column(JSON, default=dict)


class HttpCacheEntry(Base):
    __tablename__ = 'http_cache'
    id = Column(Integer, primary_key=True)
    cache_key = Column(String(200), unique=True, index=True)
    status_code = Column(Integer)
    body = Column(Text)
    headers = Column(JSON, default=dict)
    stored_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, index=True)


class QuotaCounter(Base):
    __tablename__ = 'quota_counters'
    id = Column(Integer, primary_key=True)
    scope = Column(String(80), nullable=False)     # provider name
    window = Column(String(40), nullable=False)    # minute bucket / day bucket
    count = Column(Integer, default=0)
    __table_args__ = (UniqueConstraint('scope', 'window', name='uq_quota_scope_window'),)


class AccountSnapshot(Base):
    '''Immutable profile state used to detect identity and destination changes.'''
    __tablename__ = 'account_snapshots'
    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False,
                        index=True)
    captured_at = Column(DateTime, default=utcnow, index=True)
    fingerprint = Column(String(64), nullable=False, index=True)
    state = Column(JSON, default=dict)
    changes = Column(JSON, default=list)


class EvidenceArtifact(Base):
    '''Immutable, hash-addressed evidence retained for review and export.'''
    __tablename__ = 'evidence_artifacts'
    id = Column(Integer, primary_key=True)
    assessment_id = Column(Integer, ForeignKey('risk_assessments.id', ondelete='CASCADE'),
                           index=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False,
                        index=True)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='SET NULL'), index=True)
    kind = Column(String(40), default='signal', index=True)
    source_url = Column(Text)
    content_hash = Column(String(64), nullable=False, index=True)
    captured_at = Column(DateTime, default=utcnow, index=True)
    payload = Column(JSON, default=dict)
    provenance = Column(JSON, default=dict)


class Campaign(Base):
    '''Accounts connected by shared infrastructure, payments, media, or content.'''
    __tablename__ = 'campaigns'
    id = Column(Integer, primary_key=True)
    public_id = Column(String(40), default=new_id, unique=True, index=True)
    cluster_key = Column(String(64), unique=True, index=True)
    brand_id = Column(Integer, ForeignKey('brands.id'))
    name = Column(String(300), nullable=False)
    status = Column(String(30), default='open', index=True)
    severity = Column(Float, default=0, index=True)
    dimensions = Column(JSON, default=dict)
    shared_artifacts = Column(JSON, default=list)
    summary = Column(Text)
    first_seen_at = Column(DateTime, default=utcnow)
    last_seen_at = Column(DateTime, default=utcnow, index=True)


class CampaignMember(Base):
    __tablename__ = 'campaign_members'
    id = Column(Integer, primary_key=True)
    campaign_id = Column(Integer, ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False,
                         index=True)
    account_id = Column(Integer, ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False,
                        index=True)
    match_reasons = Column(JSON, default=list)
    confidence = Column(Float, default=0.5)
    added_at = Column(DateTime, default=utcnow)
    __table_args__ = (UniqueConstraint('campaign_id', 'account_id',
                                       name='uq_campaign_account'),)


class InvestigationCase(Base):
    __tablename__ = 'investigation_cases'
    id = Column(Integer, primary_key=True)
    public_id = Column(String(40), default=new_id, unique=True, index=True)
    campaign_id = Column(Integer, ForeignKey('campaigns.id', ondelete='SET NULL'), index=True)
    title = Column(String(300), nullable=False)
    status = Column(String(30), default='open', index=True)
    priority = Column(String(20), default='high', index=True)
    assignee = Column(String(200))
    disposition = Column(String(80))
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class CaseEvidence(Base):
    __tablename__ = 'case_evidence'
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey('investigation_cases.id', ondelete='CASCADE'),
                     nullable=False, index=True)
    artifact_id = Column(Integer, ForeignKey('evidence_artifacts.id', ondelete='CASCADE'),
                         nullable=False, index=True)
    added_at = Column(DateTime, default=utcnow)
    __table_args__ = (UniqueConstraint('case_id', 'artifact_id', name='uq_case_artifact'),)
