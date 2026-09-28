'''Darkmap REST API.'''
import datetime as dt
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from . import audit, infrastructure, queue, risk, search as search_mod
from .config import get_settings
from .db import get_db, init_db
from .ai.base import NullAnalysisProvider
from .models import (Account, AccountSnapshot, AuditLog, Brand, Campaign, CampaignMember,
                     CaseEvidence, EvidenceArtifact, InvestigationCase, Job, RiskAssessment,
                     utcnow)
from .providers import available_providers
from .quota import usage
from .schemas import (AccountOut, AnalyzeIn, AssessmentOut, AuditOut, BrandIn, BrandOut,
                      CaseIn, CaseUpdate, InfrastructureInspectIn, IngestJobIn,
                      InstagramScrapeIn, InstagramSearchPageIn, JobOut, SearchResponse)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title='Darkmap',
    version='1.0.0',
    description=('Brand-protection search engine with compliant Instagram ingestion and '
                 'explainable AI risk analysis. Authorized collection only: official APIs, '
                 'user-provided exports, and clearly permitted public pages.'),
    lifespan=lifespan,
)

STATIC_DIR = Path(__file__).with_name('static')

# These are narrow, reviewed aliases used only when a user runs the quick brand search with
# the short brand name. They keep the search from classifying the institution's own public
# banking, security, or investment education as an impersonation campaign. Saved brand records
# may add more handles and domains in the dashboard.
QUICK_SEARCH_OFFICIAL_CONTEXTS = {
    'sbi': {
        'handles': ('theofficialsbi', 'sbilifeinsurance', 'sbimutualfund'),
        'domains': ('sbi.bank.in',),
    },
    'hdfc': {
        'handles': ('hdfcbank', 'hdfcsec'),
        'domains': ('hdfcbank.com', 'hdfcsec.com'),
    },
}


def _apply_quick_search_official_context(brand: Brand, query: str) -> None:
    """Merge reviewed official aliases into an inferred or saved quick-search brand."""
    context = QUICK_SEARCH_OFFICIAL_CONTEXTS.get(query.casefold(), {})
    handles = {str(value).lower().lstrip('@') for value in (brand.official_handles or [])}
    domains = {str(value).lower().lstrip('.') for value in (brand.official_domains or [])}
    handles.update(context.get('handles', ()))
    domains.update(context.get('domains', ()))
    brand.official_handles = sorted(handles)
    brand.official_domains = sorted(domains)


@app.middleware('http')
async def protect_data_routes(request: Request, call_next):
    '''Apply optional API-key auth and a request-size ceiling to data endpoints.'''
    settings = get_settings()
    if request.url.path.startswith('/v1/'):
        if settings.api_key:
            supplied = request.headers.get('x-api-key', '')
            auth = request.headers.get('authorization', '')
            if auth.lower().startswith('bearer '):
                supplied = auth[7:].strip()
            if not supplied or not secrets.compare_digest(supplied, settings.api_key):
                return JSONResponse({'detail': 'invalid or missing API key'}, status_code=401)
        content_length = request.headers.get('content-length')
        try:
            too_large = content_length is not None and int(content_length) > settings.max_request_bytes
        except ValueError:
            return JSONResponse({'detail': 'invalid Content-Length'}, status_code=400)
        if too_large:
            return JSONResponse({'detail': 'request body too large'}, status_code=413)
    return await call_next(request)


@app.get('/', include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(STATIC_DIR / 'index.html')


@app.get('/privacy', include_in_schema=False)
def privacy_policy() -> FileResponse:
    return FileResponse(STATIC_DIR / 'privacy.html')


@app.get('/data-deletion', include_in_schema=False)
def data_deletion() -> FileResponse:
    return FileResponse(STATIC_DIR / 'data-deletion.html')


def _job_out(job: Job) -> JobOut:
    payload = _redact(job.payload or {})
    return JobOut(id=job.public_id, kind=job.kind, status=job.status, attempts=job.attempts or 0,
                  payload=payload, result=job.result or {}, error=job.error,
                  created_at=job.created_at, updated_at=job.updated_at)


def _redact(value):
    if isinstance(value, dict):
        return {key: ('[REDACTED]' if any(term in key.lower() for term in
                                         ('token', 'secret', 'password', 'api_key'))
                      else _redact(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _serverless_inline_ingest(db: Session, job_payload: Dict[str, Any],
                              query: str) -> JobOut:
    '''Run and return a complete search inside one Vercel invocation.

    Vercel's bundled SQLite file and Python process are invocation-local, so a job created by
    one request cannot be safely polled by another. The local/PostgreSQL deployment keeps using
    the durable worker queue; this path returns a JSON-safe search snapshot with the job.
    '''
    from .worker import handle_ingest

    job = queue.enqueue(db, 'ingest', job_payload, max_attempts=1)
    job.status = 'running'
    job.locked_at = utcnow()
    job.locked_by = 'vercel:inline'
    job.attempts = 1
    db.flush()
    try:
        # The collection result must be ready before this request ends. Queue-based analysis is
        # disabled here, then the deterministic risk engine is run inline so result cards still
        # receive explainable scores without multiplying external LLM latency across accounts.
        ingest_payload = dict(job_payload)
        ingest_payload['analyze'] = False
        result = handle_ingest(db, ingest_payload)
        account_ids = [int(item['account_id']) for item in result.get('accounts', [])]
        if job_payload.get('analyze', True):
            fast_provider = NullAnalysisProvider(
                'serverless_live_search: fast heuristic assessment; run a durable deployment '
                'for queued Claude analysis')
            assessments = []
            for account_id in account_ids:
                assessment = risk.assess_account(
                    db, account_id, brand_id=job_payload.get('brand_id'),
                    provider=fast_provider)
                account = db.get(Account, account_id)
                assessments.append({
                    'assessment_id': assessment.id,
                    'account_id': account_id,
                    'handle': account.handle if account else None,
                    'profile_pic_url': account.profile_pic_url if account else None,
                    'instagram_url': (f'https://www.instagram.com/{account.handle}/'
                                      if account else None),
                    'overall_score': assessment.overall_score,
                    'category_scores': assessment.category_scores or {},
                    'evidence': assessment.evidence or [],
                    'limitations': assessment.limitations or [],
                    'ai_available': assessment.ai_available,
                    'dimensions': assessment.dimensions or {},
                    'alert_families': assessment.alert_families or {},
                    'independent_indicators': assessment.independent_indicators or 0,
                    'summary': assessment.summary,
                    'top_evidence': (assessment.evidence or [])[:8],
                    'recommended_action': assessment.recommended_action,
                    'confidence': assessment.confidence,
                    'created_at': (assessment.created_at.isoformat()
                                   if assessment.created_at else None),
                })
            result['assessments'] = assessments
            result['analysis_mode'] = 'heuristics_inline'
        db.flush()
        # Every account and post in this invocation was collected because of the live query.
        # Return the complete collection, including related authors whose profile text does not
        # repeat the keyword, so the UI does not hide successfully scraped data.
        snapshot = search_mod.search(
            db, q=None, scope='all', account_ids=account_ids, limit=500)
        inline_search = SearchResponse.model_validate(snapshot).model_dump(mode='json')
        inline_search['query'] = query
        inline_search['complete_collection'] = not result.get('collection_partial', False)
        result['inline_search'] = inline_search
        result['serverless_inline'] = True
        queue.complete(db, job, result)
    except Exception as exc:  # return the terminal failure to the same browser request
        # A database flush error leaves SQLAlchemy in a failed transaction. Rebuild a terminal
        # job after rollback so serverless callers still receive structured JSON.
        db.rollback()
        job = queue.enqueue(db, 'ingest', job_payload, max_attempts=1)
        job.status = 'running'
        job.locked_at = utcnow()
        job.locked_by = 'vercel:inline'
        job.attempts = 1
        db.flush()
        queue.fail(db, job, f'{type(exc).__name__}: {exc}')
    db.commit()
    db.refresh(job)
    return _job_out(job)


@app.get('/healthz')
def healthz(db: Session = Depends(get_db)) -> Dict[str, Any]:
    s = get_settings()
    return {
        'status': 'ok',
        'env': s.env,
        'database': s.database_url.split('://')[0],
        'ai': {'provider': 'experiential_labs_claude', 'model': s.analysis_model,
               'configured': s.ai_enabled},
        'instagram': {'provider': 'meta_graph_api_v26',
                      'configured': bool(s.ig_access_token and s.ig_business_id)},
        'instagram_alternative': {
            'provider': 'bright_data_instagram',
            'configured': bool(s.bright_data_api_key),
            'keyword_search_configured': bool(
                s.bright_data_api_key and s.bright_data_serp_zone),
        },
        'ingestion_providers': available_providers(),
        'quota': {p['name']: usage(db, p['name']) for p in available_providers()},
        'compliance': {
            'authorized_sources_only': True,
            'evasion_features': 'none (no rate-limit bypass, rotation, stealth, or CAPTCHA solving)',
            'public_page_allowlist': s.public_page_allowlist,
        },
        'brand_protection': {
            'alert_families': [
                'credential_takeover', 'payment_fraud', 'fake_customer_support',
                'scam_promotions', 'counterfeit_sales',
                'employee_recruiter_impersonation', 'malicious_apps_downloads',
                'investment_financial_impersonation',
            ],
            'risk_dimensions': ['deception', 'harm', 'exposure', 'coordination'],
            'media_observations': ['ocr_text', 'qr_payloads', 'transcript',
                                   'brand_match_score', 'synthetic_media_score',
                                   'perceptual_hash'],
            'account_change_monitoring': True,
            'campaign_clustering': True,
            'victim_signal_analysis': True,
            'velocity_monitoring': True,
            'redirect_tls_inspection': True,
            'evidence_hashing_and_cases': True,
        },
    }


# ----------------------------- brands -----------------------------
@app.post('/v1/brands', response_model=BrandOut, status_code=201)
def create_brand(payload: BrandIn, db: Session = Depends(get_db)) -> Brand:
    existing = db.scalar(select(Brand).where(Brand.name == payload.name))
    if existing:
        raise HTTPException(409, f'brand "{payload.name}" already exists')
    brand = Brand(name=payload.name,
                  official_handles=[h.lstrip('@').lower() for h in payload.official_handles],
                  official_domains=[d.lower() for d in payload.official_domains],
                  keywords=payload.keywords)
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@app.get('/v1/brands', response_model=List[BrandOut])
def list_brands(db: Session = Depends(get_db)):
    return list(db.scalars(select(Brand).order_by(Brand.name)).all())


# ----------------------------- ingestion -----------------------------
@app.post('/v1/instagram/search-page', response_model=JobOut)
def search_instagram_page(payload: InstagramSearchPageIn,
                          db: Session = Depends(get_db)) -> JobOut:
    """Return up to 50 additional rows while preserving all uncompleted collection work."""
    from .normalize import ingest_bundle
    from .providers.instagram_pages import PagedInstagramCollector, hit_key
    from .search_cursor import InvalidSearchCursor, decode_cursor, encode_cursor
    from .http import NotAuthorized

    started = time.monotonic()
    settings = get_settings()
    if not (settings.bright_data_api_key and settings.bright_data_serp_zone):
        raise HTTPException(503, 'An Instagram keyword collection source is required')
    if payload.continuation:
        try:
            checkpoint = decode_cursor(payload.continuation)
        except InvalidSearchCursor as exc:
            raise HTTPException(400, str(exc)) from exc
        if payload.query.strip() and payload.query.strip() != checkpoint['query']:
            raise HTTPException(400, 'Search continuation belongs to another query')
    else:
        query = ' '.join(payload.query.split()).strip()
        if not query:
            raise HTTPException(422, 'Enter an Instagram search keyword')
        brand = db.get(Brand, payload.brand_id) if payload.brand_id else None
        if payload.brand_id and brand is None:
            raise HTTPException(404, 'brand not found')
        if brand is None:
            brand = db.scalar(select(Brand).where(func.lower(Brand.name) == query.lower()))
        if brand is None:
            brand = Brand(name=query, official_handles=[query.lower()]
                          if re.fullmatch(r'[A-Za-z0-9._]{2,30}', query) else [],
                          official_domains=[], keywords=[query])
        _apply_quick_search_official_context(brand, query)
        checkpoint = {
            'version': 1, 'id': secrets.token_hex(16), 'expires_at': time.time() + 21600,
            'query': query, 'retrieved_at': utcnow().isoformat(), 'visible': [], 'page': 0,
            'params': {**payload.model_dump(exclude={'continuation', 'query', 'brand_id'}),
                       'mode': 'keyword'},
            'brand': {key: getattr(brand, key) for key in
                      ('name', 'official_handles', 'official_domains', 'keywords')},
        }
    # Release a possible read transaction before the network phase. A slow source must not
    # hold a SQLite write lock while the browser reads dashboard counters.
    db.commit()
    collector = PagedInstagramCollector(db, checkpoint)
    try:
        bundles = collector.collect(target_results=len(checkpoint['visible']) + 50)
    except NotAuthorized as exc:
        db.rollback()
        raise HTTPException(403, 'The connected collection source refused access. Check access settings.') from exc

    brand_data = checkpoint['brand']
    brand = db.scalar(select(Brand).where(Brand.name == brand_data['name']))
    if brand is None:
        brand = Brand(**brand_data)
        db.add(brand)
        db.flush()
    imported = [ingest_bundle(db, bundle, brand=brand) for bundle in bundles]
    account_ids = list(dict.fromkeys(item['account_id'] for item in imported))
    assessments = []
    if checkpoint['params'].get('analyze', True):
        provider = NullAnalysisProvider('paged_live_search: deterministic risk assessment')
        for account_id in account_ids:
            assessment = risk.assess_account(db, account_id, brand_id=brand.id, provider=provider)
            account = db.get(Account, account_id)
            assessments.append({
                'assessment_id': assessment.id, 'account_id': account_id,
                'handle': account.handle, 'profile_pic_url': account.profile_pic_url,
                'instagram_url': f'https://www.instagram.com/{account.handle}/',
                'overall_score': assessment.overall_score,
                'category_scores': assessment.category_scores or {},
                'evidence': assessment.evidence or [], 'limitations': assessment.limitations or [],
                'ai_available': assessment.ai_available, 'dimensions': assessment.dimensions or {},
                'alert_families': assessment.alert_families or {},
                'independent_indicators': assessment.independent_indicators or 0,
                'summary': assessment.summary, 'top_evidence': (assessment.evidence or [])[:8],
                'recommended_action': assessment.recommended_action,
                'confidence': assessment.confidence, 'created_at': assessment.created_at,
            })
    db.flush()
    snapshot = SearchResponse.model_validate(search_mod.search(
        db, q=None, scope='all', account_ids=account_ids, limit=2000)).model_dump(mode='json')
    # Keep previously shown identities, then add at most 50 new identities in ranked order.
    # Rehydrating the accumulated evidence on each page also re-runs cross-account signals.
    unique_hits = {}
    for hit in snapshot['hits']:
        unique_hits.setdefault(hit_key(hit), hit)
    snapshot['hits'] = list(unique_hits.values())
    previous = set(checkpoint['visible'])
    new_hits = [hit for hit in snapshot['hits'] if hit_key(hit) not in previous][:50]
    checkpoint['visible'].extend(hit_key(hit) for hit in new_hits)
    visible = set(checkpoint['visible'])
    hits = [hit for hit in snapshot['hits'] if hit_key(hit) in visible]
    buffered = sum(hit_key(hit) not in visible for hit in snapshot['hits'])
    has_more = collector.has_work() or buffered > 0
    source_error = checkpoint.get('source_error')
    if source_error:
        outcome = 'blocked'
    elif not hits and not has_more and checkpoint['errors']:
        outcome = 'failed'
        source_error = {'code': 'collection_failed', 'message':
            'Collection could not be completed because the source returned errors. Retry this search. No results does not mean no matching Instagram content exists.'}
    elif not hits and has_more:
        outcome = 'pending'
    elif has_more or checkpoint['errors']:
        outcome = 'partial'
    else:
        outcome = 'complete' if hits else 'empty'
    checkpoint['page'] += 1
    checkpoint['elapsed_seconds'] = checkpoint.get('elapsed_seconds', 0) + time.monotonic() - started
    snapshot.update(query=checkpoint['query'], hits=hits, total=len(hits), total_all=len(hits),
                    complete_collection=not has_more and not checkpoint['errors'] and not source_error)
    snapshot['facets'] = {
        'accounts': sum(h['doc_type'] == 'account' for h in hits),
        'posts': sum(h['doc_type'] == 'post' for h in hits),
        **{name: sum(name in h.get('matched_fields', []) for h in hits)
           for name in ('hashtags', 'mentions', 'urls')},
    }
    try:
        continuation = encode_cursor(checkpoint) if has_more else None
    except InvalidSearchCursor as exc:
        raise HTTPException(413, str(exc)) from exc
    result = {
        'serverless_inline': True, 'inline_search': snapshot, 'accounts': imported,
        'account_count': snapshot['facets']['accounts'], 'posts': snapshot['facets']['posts'],
        'comments': sum(len(h.get('comments', [])) for h in hits),
        'assessments': assessments, 'analysis_mode': 'heuristics_inline',
        'collection_partial': has_more or bool(checkpoint['errors']) or bool(source_error),
        'collection_outcome': outcome, 'collection_error': source_error,
        'pagination': {'has_more': has_more, 'continuation': continuation,
            'outcome': outcome,
            'page_size': 50, 'page': checkpoint['page'], 'new_results': len(new_hits),
            'loaded_results': len(hits), 'buffered_results': buffered,
            'pending_snapshots': len(checkpoint['snapshots']),
            'queries_completed': checkpoint['queries_completed'], 'queries_total': 17,
            'collection_complete': not collector.has_work() and not checkpoint['errors'] and not source_error,
            'failed_branches': len(checkpoint['errors']),
            'retry_after_seconds': max(0, int(checkpoint['blocked_until'] - time.time())),
            'total_seconds': round(checkpoint['elapsed_seconds'], 3)},
    }
    failed = not hits and outcome in ('blocked', 'failed')
    audit.record(db, action='ingest.page', target=checkpoint['query'], status=outcome,
                 detail={'new_results': len(new_hits), 'loaded_results': len(hits),
                         'has_more': has_more, 'page': checkpoint['page'],
                         'error_code': source_error['code'] if source_error else None})
    db.commit()
    return JobOut(id=checkpoint['id'], kind='ingest', status='failed' if failed else 'succeeded', attempts=1,
                  payload={'handle': checkpoint['query']}, result=result,
                  error=source_error['message'] if source_error else None,
                  created_at=checkpoint['retrieved_at'], updated_at=utcnow())


@app.post('/v1/instagram/scrape', response_model=JobOut, status_code=202)
def scrape_instagram(payload: InstagramScrapeIn,
                     db: Session = Depends(get_db)) -> JobOut:
    '''Queue Instagram collection through Meta or the licensed Bright Data API.'''
    if payload.mode in ('account', 'hashtag_recent', 'hashtag_top', 'keyword') and not payload.query.strip():
        raise HTTPException(422, 'query is required for account, hashtag, and keyword modes')
    if payload.brand_id is not None and db.get(Brand, payload.brand_id) is None:
        raise HTTPException(404, 'brand not found')
    settings = get_settings()
    meta_ready = bool(settings.ig_access_token and settings.ig_business_id)
    bright_account_ready = bool(settings.bright_data_api_key)
    bright_keyword_ready = bool(settings.bright_data_api_key and settings.bright_data_serp_zone)
    needs_keyword = payload.mode in ('keyword', 'hashtag_recent', 'hashtag_top')
    meta_only = payload.mode in ('owned', 'tagged')

    if payload.provider == 'meta':
        if not meta_ready:
            raise HTTPException(503, 'Meta Instagram credentials are not configured')
        provider = 'instagram_graph'
    elif payload.provider == 'bright_data':
        if meta_only:
            raise HTTPException(422, 'owned and tagged modes require the authorized Meta API')
        if not (bright_keyword_ready if needs_keyword else bright_account_ready):
            needed = 'BRIGHT_DATA_API_KEY and BRIGHT_DATA_SERP_ZONE' if needs_keyword else 'BRIGHT_DATA_API_KEY'
            raise HTTPException(503, f'{needed} are not configured')
        provider = 'bright_data_instagram'
    elif meta_ready:
        provider = 'instagram_graph'
    elif not meta_only and (bright_keyword_ready if needs_keyword else bright_account_ready):
        provider = 'bright_data_instagram'
    else:
        # Preserve the durable-queue contract for API clients. The worker will record a clear
        # ProviderNotConfigured failure; the dashboard uses /healthz to prevent this state.
        provider = 'instagram_graph'
    brand_id = payload.brand_id
    clean_query = payload.query.strip().lstrip('@#')
    if (brand_id is None and payload.mode in ('keyword', 'hashtag_recent', 'hashtag_top')
            and re.fullmatch(r'[A-Za-z0-9._]{2,30}', clean_query)):
        # A single brand-like live-search term supplies the risk engine with the comparison
        # context it needs. Reuse a saved brand when present; otherwise this creates a compact
        # inferred context (ephemeral on Vercel's request-local SQLite).
        inferred = db.scalar(
            select(Brand).where(func.lower(Brand.name) == clean_query.lower()))
        if inferred is None:
            inferred = Brand(
                name=clean_query,
                official_handles=[clean_query.lower()],
                keywords=[clean_query],
                official_domains=[],
            )
            db.add(inferred)
            db.flush()
        _apply_quick_search_official_context(inferred, clean_query)
        brand_id = inferred.id

    params = {
        'mode': payload.mode,
        'max_items': payload.max_items,
        'page_size': payload.page_size,
        'max_pages': payload.max_pages,
        'include_comments': payload.include_comments,
        'comments_per_post': payload.comments_per_post,
        'profile_limit': payload.profile_limit,
        'fresh': payload.fresh,
    }
    job_payload = {
        'provider': provider,
        'handle': payload.query,
        'params': params,
        'brand_id': brand_id,
        'analyze': payload.analyze,
    }
    if os.getenv('VERCEL'):
        return _serverless_inline_ingest(db, job_payload, payload.query)
    # Explicit fresh searches always enqueue a new collection, even for the same query.
    # API clients may still opt into the legacy reuse behavior by leaving fresh disabled.
    cutoff = dt.datetime.utcnow() - dt.timedelta(seconds=settings.cache_ttl)
    recent = db.scalars(select(Job).where(
        Job.kind == 'ingest', Job.created_at >= cutoff,
        Job.status.in_(('queued', 'running', 'succeeded')),
    ).order_by(desc(Job.id)).limit(100)).all()
    for existing in ([] if payload.fresh else recent):
        if (existing.payload or {}) == job_payload:
            audit.record(db, action='queue.reuse', target=f'ingest:{existing.public_id}',
                         status='cache_hit', detail={'query': payload.query,
                                                     'job_status': existing.status})
            db.commit()
            return _job_out(existing)
    job = queue.enqueue(db, 'ingest', job_payload)
    db.commit()
    return _job_out(job)


@app.post('/v1/ingest/jobs', response_model=JobOut, status_code=202)
def create_ingest_job(payload: IngestJobIn, db: Session = Depends(get_db)) -> JobOut:
    names = {p['name'] for p in available_providers()}
    if payload.provider not in names:
        raise HTTPException(400, f'unknown provider "{payload.provider}"; available: {sorted(names)}')
    job = queue.enqueue(db, 'ingest', payload.model_dump())
    db.commit()
    return _job_out(job)


@app.get('/v1/ingest/jobs/{public_id}', response_model=JobOut)
def get_job(public_id: str, db: Session = Depends(get_db)) -> JobOut:
    job = db.scalar(select(Job).where(Job.public_id == public_id))
    if job is None:
        raise HTTPException(404, 'job not found')
    return _job_out(job)


@app.get('/v1/jobs', response_model=List[JobOut])
def list_jobs(status: Optional[str] = None, limit: int = Query(50, le=200),
              db: Session = Depends(get_db)) -> List[JobOut]:
    stmt = select(Job).order_by(desc(Job.id)).limit(limit)
    if status:
        stmt = stmt.where(Job.status == status)
    return [_job_out(j) for j in db.scalars(stmt).all()]


# ----------------------------- accounts -----------------------------
@app.get('/v1/accounts', response_model=List[AccountOut])
def list_accounts(min_risk: Optional[float] = None, action: Optional[str] = None,
                  limit: int = Query(50, le=200), offset: int = 0,
                  db: Session = Depends(get_db)):
    stmt = select(Account).order_by(desc(Account.latest_risk_score), Account.id)
    if min_risk is not None:
        stmt = stmt.where(Account.latest_risk_score >= min_risk)
    if action:
        stmt = stmt.where(Account.latest_action == action)
    return list(db.scalars(stmt.offset(offset).limit(limit)).all())


@app.get('/v1/accounts/{account_id}')
def get_account(account_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    acc = db.get(Account, account_id)
    if acc is None:
        raise HTTPException(404, 'account not found')
    latest = db.scalar(select(RiskAssessment)
                       .where(RiskAssessment.account_id == account_id)
                       .order_by(desc(RiskAssessment.created_at), desc(RiskAssessment.id))
                       .limit(1))
    return {
        'account': AccountOut.model_validate(acc).model_dump(),
        'post_count': len(acc.posts),
        'latest_assessment': (AssessmentOut.model_validate(latest).model_dump()
                              if latest else None),
    }


@app.get('/v1/accounts/{account_id}/assessments', response_model=List[AssessmentOut])
def account_assessments(account_id: int, limit: int = Query(20, le=100),
                        db: Session = Depends(get_db)):
    return list(db.scalars(select(RiskAssessment)
                           .where(RiskAssessment.account_id == account_id)
                           .order_by(desc(RiskAssessment.id)).limit(limit)).all())


# ----------------------------- analysis -----------------------------
@app.post('/v1/analysis/accounts/{account_id}')
def analyze_account(account_id: int, payload: Optional[AnalyzeIn] = None,
                    db: Session = Depends(get_db)) -> Dict[str, Any]:
    payload = payload or AnalyzeIn()
    if db.get(Account, account_id) is None:
        raise HTTPException(404, 'account not found')
    if payload.inline:
        assessment = risk.assess_account(db, account_id, brand_id=payload.brand_id,
                                         media_analysis=payload.media_analysis)
        db.commit()
        db.refresh(assessment)
        return {'mode': 'inline',
                'assessment': AssessmentOut.model_validate(assessment).model_dump()}
    job = queue.enqueue(db, 'analyze', {'account_id': account_id, 'brand_id': payload.brand_id,
                                        'media_analysis': payload.media_analysis})
    db.commit()
    return {'mode': 'queued', 'job': _job_out(job).model_dump()}


@app.get('/v1/assessments/{assessment_id}', response_model=AssessmentOut)
def get_assessment(assessment_id: int, db: Session = Depends(get_db)) -> RiskAssessment:
    item = db.get(RiskAssessment, assessment_id)
    if item is None:
        raise HTTPException(404, 'assessment not found')
    return item


# ----------------------------- alerts / campaigns / cases -----------------------------
@app.get('/v1/alerts')
def list_alerts(family: Optional[str] = None, min_score: float = 45,
                critical_only: bool = False, limit: int = Query(100, le=500),
                db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    '''Return the newest assessment per account with family and dimension detail.'''
    assessments = db.scalars(select(RiskAssessment).where(
        RiskAssessment.overall_score >= (85 if critical_only else min_score))
        .order_by(desc(RiskAssessment.created_at), desc(RiskAssessment.id))
        .limit(limit * 4)).all()
    seen, out = set(), []
    for assessment in assessments:
        if assessment.account_id in seen:
            continue
        family_data = assessment.alert_families or {}
        if family and not (family_data.get(family) or {}).get('active'):
            continue
        account = db.get(Account, assessment.account_id)
        seen.add(assessment.account_id)
        out.append({
            'assessment_id': assessment.id,
            'account_id': assessment.account_id,
            'handle': account.handle if account else None,
            'profile_pic_url': account.profile_pic_url if account else None,
            'instagram_url': (f'https://www.instagram.com/{account.handle}/' if account else None),
            'overall_score': assessment.overall_score,
            'dimensions': assessment.dimensions or {},
            'alert_families': family_data,
            'independent_indicators': assessment.independent_indicators or 0,
            'confidence': assessment.confidence,
            'recommended_action': assessment.recommended_action,
            'summary': assessment.summary,
            'top_evidence': (assessment.evidence or [])[:8],
            'created_at': assessment.created_at,
        })
        if len(out) >= limit:
            break
    return out


@app.get('/v1/accounts/{account_id}/history')
def account_history(account_id: int, limit: int = Query(50, le=200),
                    db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    if db.get(Account, account_id) is None:
        raise HTTPException(404, 'account not found')
    snapshots = db.scalars(select(AccountSnapshot).where(
        AccountSnapshot.account_id == account_id).order_by(desc(AccountSnapshot.id))
        .limit(limit)).all()
    return [{'id': item.id, 'captured_at': item.captured_at, 'fingerprint': item.fingerprint,
             'state': item.state or {}, 'changes': item.changes or []} for item in snapshots]


@app.get('/v1/campaigns')
def list_campaigns(status: Optional[str] = None, min_severity: float = 0,
                   limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    stmt = select(Campaign).where(Campaign.severity >= min_severity).order_by(
        desc(Campaign.severity), desc(Campaign.last_seen_at)).limit(limit)
    if status:
        stmt = stmt.where(Campaign.status == status)
    campaigns = db.scalars(stmt).all()
    out = []
    for campaign in campaigns:
        members = db.scalars(select(CampaignMember).where(
            CampaignMember.campaign_id == campaign.id)).all()
        out.append({
            'id': campaign.id, 'public_id': campaign.public_id, 'name': campaign.name,
            'status': campaign.status, 'severity': campaign.severity,
            'dimensions': campaign.dimensions or {},
            'shared_artifacts': campaign.shared_artifacts or [],
            'summary': campaign.summary, 'first_seen_at': campaign.first_seen_at,
            'last_seen_at': campaign.last_seen_at,
            'members': [{'account_id': member.account_id,
                         'handle': (db.get(Account, member.account_id).handle
                                    if db.get(Account, member.account_id) else None),
                         'confidence': member.confidence,
                         'match_reasons': member.match_reasons or []} for member in members],
        })
    return out


def _case_json(db: Session, case: InvestigationCase) -> Dict[str, Any]:
    links = db.scalars(select(CaseEvidence).where(CaseEvidence.case_id == case.id)).all()
    return {
        'id': case.id, 'public_id': case.public_id, 'campaign_id': case.campaign_id,
        'title': case.title, 'status': case.status, 'priority': case.priority,
        'assignee': case.assignee, 'disposition': case.disposition, 'notes': case.notes,
        'artifact_ids': [link.artifact_id for link in links],
        'created_at': case.created_at, 'updated_at': case.updated_at,
    }


@app.post('/v1/cases', status_code=201)
def create_case(payload: CaseIn, db: Session = Depends(get_db)):
    if payload.campaign_id and db.get(Campaign, payload.campaign_id) is None:
        raise HTTPException(404, 'campaign not found')
    case = InvestigationCase(title=payload.title, campaign_id=payload.campaign_id,
                             priority=payload.priority, assignee=payload.assignee,
                             notes=payload.notes)
    db.add(case)
    db.flush()
    artifact_ids = list(payload.artifact_ids)
    if payload.assessment_id:
        if db.get(RiskAssessment, payload.assessment_id) is None:
            raise HTTPException(404, 'assessment not found')
        artifact_ids.extend(db.scalars(select(EvidenceArtifact.id).where(
            EvidenceArtifact.assessment_id == payload.assessment_id)).all())
    for artifact_id in dict.fromkeys(artifact_ids):
        if db.get(EvidenceArtifact, artifact_id):
            db.add(CaseEvidence(case_id=case.id, artifact_id=artifact_id))
    audit.record(db, action='case.create', target=case.public_id, status='ok',
                 detail={'title': case.title, 'priority': case.priority})
    db.commit()
    return _case_json(db, case)


@app.get('/v1/cases')
def list_cases(status: Optional[str] = None, limit: int = Query(100, le=500),
               db: Session = Depends(get_db)):
    stmt = select(InvestigationCase).order_by(desc(InvestigationCase.updated_at)).limit(limit)
    if status:
        stmt = stmt.where(InvestigationCase.status == status)
    return [_case_json(db, case) for case in db.scalars(stmt).all()]


@app.patch('/v1/cases/{case_id}')
def update_case(case_id: int, payload: CaseUpdate, db: Session = Depends(get_db)):
    case = db.get(InvestigationCase, case_id)
    if case is None:
        raise HTTPException(404, 'case not found')
    supplied = payload.model_fields_set
    for field in ('status', 'priority', 'assignee', 'disposition', 'notes'):
        if field in supplied:
            setattr(case, field, getattr(payload, field))
    for artifact_id in dict.fromkeys(payload.artifact_ids):
        if db.get(EvidenceArtifact, artifact_id) and not db.scalar(select(CaseEvidence).where(
                CaseEvidence.case_id == case.id, CaseEvidence.artifact_id == artifact_id)):
            db.add(CaseEvidence(case_id=case.id, artifact_id=artifact_id))
    case.updated_at = utcnow()
    audit.record(db, action='case.update', target=case.public_id, status='ok',
                 detail={'fields': sorted(supplied)})
    db.commit()
    return _case_json(db, case)


@app.get('/v1/cases/{case_id}/evidence-package')
def export_evidence_package(case_id: int, db: Session = Depends(get_db)):
    case = db.get(InvestigationCase, case_id)
    if case is None:
        raise HTTPException(404, 'case not found')
    links = db.scalars(select(CaseEvidence).where(CaseEvidence.case_id == case.id)).all()
    artifacts = [db.get(EvidenceArtifact, link.artifact_id) for link in links]
    artifacts = [artifact for artifact in artifacts if artifact]
    package = {
        'format': 'darkmap-evidence-package/v1',
        'exported_at': utcnow().isoformat(),
        'case': _case_json(db, case),
        'campaign': None,
        'artifacts': [{'id': item.id, 'kind': item.kind, 'source_url': item.source_url,
                       'content_hash': item.content_hash, 'captured_at': item.captured_at,
                       'payload': item.payload, 'provenance': item.provenance}
                      for item in artifacts],
    }
    if case.campaign_id:
        campaign = db.get(Campaign, case.campaign_id)
        if campaign:
            package['campaign'] = {'id': campaign.id, 'public_id': campaign.public_id,
                                   'name': campaign.name, 'shared_artifacts': campaign.shared_artifacts,
                                   'severity': campaign.severity}
    package['manifest_hash'] = __import__('hashlib').sha256(
        str([(item.id, item.content_hash) for item in artifacts]).encode()).hexdigest()
    audit.record(db, action='case.export', target=case.public_id, status='ok',
                 detail={'artifacts': len(artifacts), 'manifest_hash': package['manifest_hash']})
    db.commit()
    return package


@app.post('/v1/infrastructure/inspect')
def inspect_infrastructure(payload: InfrastructureInspectIn,
                           db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        result = infrastructure.inspect_url(payload.url)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f'infrastructure inspection failed: {str(exc)[:240]}') from exc
    audit.record(db, action='infrastructure.inspect', provider='safe_http',
                 target=result.get('final_domain'), status='ok',
                 lawful_basis='permitted_public_page',
                 detail={'redirect_count': result.get('redirect_count'),
                         'input_url': payload.url})
    db.commit()
    return result


# ----------------------------- search -----------------------------
@app.get('/v1/search', response_model=SearchResponse)
def search(q: Optional[str] = None, doc_type: Optional[str] = Query(None, pattern='^(account|post)$'),
           scope: str = Query('all', pattern='^(all|accounts|posts|hashtags|mentions|urls)$'),
           account_ids: Optional[str] = None,
           handle: Optional[str] = None, hashtag: Optional[str] = None,
           mention: Optional[str] = None, domain: Optional[str] = None,
           min_risk: Optional[float] = None,
           since: Optional[dt.datetime] = None, until: Optional[dt.datetime] = None,
           limit: int = Query(25, le=500), offset: int = 0,
           db: Session = Depends(get_db)) -> Dict[str, Any]:
    parsed_account_ids = None
    if account_ids is not None:
        try:
            parsed_account_ids = [int(value) for value in account_ids.split(',') if value][:100]
        except ValueError as exc:
            raise HTTPException(422, 'account_ids must be comma-separated integers') from exc
    return search_mod.search(db, q=q, doc_type=doc_type, scope=scope,
                             account_ids=parsed_account_ids,
                             handle=handle, hashtag=hashtag,
                             mention=mention, domain=domain, min_risk=min_risk, since=since,
                             until=until, limit=limit, offset=offset)


# ----------------------------- audit -----------------------------
@app.get('/v1/audit', response_model=List[AuditOut])
def audit_tail(action: Optional[str] = None, provider: Optional[str] = None,
               limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(desc(AuditLog.id)).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if provider:
        stmt = stmt.where(AuditLog.provider == provider)
    return list(db.scalars(stmt).all())


app.mount('/static', StaticFiles(directory=STATIC_DIR), name='static')
