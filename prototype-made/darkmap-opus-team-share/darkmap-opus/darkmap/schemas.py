'''Pydantic request/response models.'''
import datetime as dt
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class BrandIn(BaseModel):
    name: str
    official_handles: List[str] = Field(default_factory=list)
    official_domains: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)


class BrandOut(BrandIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class IngestJobIn(BaseModel):
    provider: str = Field(
        description='export_file | instagram_graph | bright_data_instagram | public_page')
    handle: str = ''
    params: Dict[str, Any] = Field(default_factory=dict)
    brand_id: Optional[int] = None
    analyze: bool = True
    media_analysis: Optional[List[Dict[str, Any]]] = None


class InstagramScrapeIn(BaseModel):
    provider: Literal['auto', 'meta', 'bright_data'] = 'auto'
    mode: Literal['account', 'owned', 'hashtag_recent', 'hashtag_top', 'keyword', 'tagged'] = 'account'
    query: str = Field(default='', max_length=200,
                       description='Username for account mode or hashtag for hashtag modes')
    brand_id: Optional[int] = None
    max_items: int = Field(default=100, ge=1, le=500)
    page_size: int = Field(default=50, ge=1, le=100)
    max_pages: int = Field(default=10, ge=1, le=20)
    include_comments: bool = True
    comments_per_post: int = Field(default=50, ge=1, le=100)
    profile_limit: int = Field(default=25, ge=0, le=50)
    analyze: bool = True
    fresh: bool = Field(default=False, description='Collect again instead of reusing cached responses or jobs')


class JobOut(BaseModel):
    id: str
    kind: str
    status: str
    attempts: int
    payload: Dict[str, Any] = Field(default_factory=dict)
    result: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    created_at: Optional[dt.datetime] = None
    updated_at: Optional[dt.datetime] = None


class InstagramSearchPageIn(InstagramScrapeIn):
    mode: Literal['keyword'] = 'keyword'
    batch_size: Literal[50] = 50
    # A result page can contain as many as 50 accounts. Request metadata for the whole page so
    # follower counts, verification and avatars do not disappear after the first 25 profiles.
    profile_limit: int = Field(default=50, ge=0, le=50)
    continuation: Optional[str] = Field(default=None, max_length=1_800_000)


class AnalyzeIn(BaseModel):
    brand_id: Optional[int] = None
    media_analysis: Optional[List[Dict[str, Any]]] = None
    inline: bool = Field(default=False,
                         description='run synchronously instead of enqueuing a job')


class InfrastructureInspectIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
    brand_id: Optional[int] = None
    overall_score: float
    category_scores: Dict[str, float] = Field(default_factory=dict)
    dimensions: Dict[str, float] = Field(default_factory=dict)
    alert_families: Dict[str, Any] = Field(default_factory=dict)
    independent_indicators: int = 0
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float
    limitations: List[str] = Field(default_factory=list)
    recommended_action: Optional[str] = None
    summary: Optional[str] = None
    heuristic_score: Optional[float] = None
    ai_score: Optional[float] = None
    ai_available: bool = False
    model: Optional[str] = None
    engine_version: Optional[str] = None
    created_at: Optional[dt.datetime] = None

class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    platform: str
    handle: str
    display_name: Optional[str] = None
    biography: Optional[str] = None
    external_url: Optional[str] = None
    is_verified: Optional[bool] = None
    followers_count: Optional[int] = None
    media_count: Optional[int] = None
    latest_risk_score: Optional[float] = None
    latest_action: Optional[str] = None
    provenance: Dict[str, Any] = Field(default_factory=dict)
    last_seen_at: Optional[dt.datetime] = None

class SearchHit(BaseModel):
    doc_type: str
    account_id: int
    post_id: Optional[int] = None
    handle: Optional[str] = None
    title: Optional[str] = None
    snippet: Optional[str] = None
    instagram_url: Optional[str] = None
    image_url: Optional[str] = None
    profile_pic_url: Optional[str] = None
    outbound_url: Optional[str] = None
    post_type: Optional[str] = None
    is_verified: Optional[bool] = None
    followers_count: Optional[int] = None
    follows_count: Optional[int] = None
    media_count: Optional[int] = None
    like_count: Optional[int] = None
    comment_count: Optional[int] = None
    view_count: Optional[int] = None
    share_count: Optional[int] = None
    language: Optional[str] = None
    hashtags: List[str] = Field(default_factory=list)
    mentions: List[str] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)
    content: Optional[str] = None
    media: List[Dict[str, Any]] = Field(default_factory=list)
    comments: List[Dict[str, Any]] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    matched_fields: List[str] = Field(default_factory=list)
    risk_score: Optional[float] = None
    posted_at: Optional[dt.datetime] = None
    score: float = 0.0
    ranking_factors: Dict[str, float] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: Optional[str] = None
    scope: str = 'all'
    total: int
    total_all: int = 0
    facets: Dict[str, int] = Field(default_factory=dict)
    hits: List[SearchHit]


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    at: Optional[dt.datetime] = None
    actor: Optional[str] = None
    action: str
    provider: Optional[str] = None
    target: Optional[str] = None
    status: Optional[str] = None
    lawful_basis: Optional[str] = None
    duration_ms: Optional[int] = None
    detail: Dict[str, Any] = Field(default_factory=dict)


class CaseIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    campaign_id: Optional[int] = None
    assessment_id: Optional[int] = None
    priority: Literal['low', 'medium', 'high', 'critical'] = 'high'
    assignee: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=5000)
    artifact_ids: List[int] = Field(default_factory=list, max_length=500)


class CaseUpdate(BaseModel):
    status: Optional[Literal['open', 'investigating', 'takedown_submitted', 'resolved',
                             'false_positive']] = None
    priority: Optional[Literal['low', 'medium', 'high', 'critical']] = None
    assignee: Optional[str] = Field(default=None, max_length=200)
    disposition: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=5000)
    artifact_ids: List[int] = Field(default_factory=list, max_length=500)
