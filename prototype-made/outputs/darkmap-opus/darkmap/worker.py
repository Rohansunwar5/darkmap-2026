'''Worker loop: drains the job queue (ingest + analyze).'''
import argparse
import logging
import time
from typing import Any, Dict

from sqlalchemy.orm import Session

from . import queue, risk
from .config import get_settings
from .db import init_db, session_scope
from .models import Brand, Job
from .normalize import ingest_bundle
from .providers import get_provider
from .providers.base import CollectionNotPermitted, ProviderNotConfigured
from .quota import QuotaExceeded

log = logging.getLogger('darkmap.worker')


def handle_ingest(session: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    provider = get_provider(payload['provider'], session, payload.get('params') or {})
    handle = payload.get('handle', '')
    bundles = provider.fetch_many(handle)
    if not bundles:
        raise CollectionNotPermitted('provider returned no ingestible accounts')
    brand_id = payload.get('brand_id')
    brand = session.get(Brand, brand_id) if brand_id is not None else None
    if brand_id is not None and brand is None:
        raise ValueError(f'brand {brand_id} not found')
    imported = [ingest_bundle(session, bundle, brand=brand) for bundle in bundles]
    result = {
        'accounts': [{'account_id': item['account_id'], 'posts': item['posts'],
                      'media': item['media'], 'comments': item['comments']}
                     for item in imported],
        'account_count': len(imported),
        'posts': sum(item['posts'] for item in imported),
        'media': sum(item['media'] for item in imported),
        'comments': sum(item['comments'] for item in imported),
        'collection_partial': bool(getattr(provider, 'collection_partial', False)),
    }
    if len(imported) == 1:
        result['account_id'] = imported[0]['account_id']
    if payload.get('analyze', True):
        jobs = [queue.enqueue(session, 'analyze',
                              {'account_id': item['account_id'],
                               'brand_id': payload.get('brand_id'),
                               'media_analysis': payload.get('media_analysis')})
                for item in imported]
        result['analysis_jobs'] = [job.public_id for job in jobs]
        if len(jobs) == 1:
            result['analysis_job'] = jobs[0].public_id
    return result


def handle_analyze(session: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    assessment = risk.assess_account(
        session, payload['account_id'], brand_id=payload.get('brand_id'),
        media_analysis=payload.get('media_analysis'))
    return {'assessment_id': assessment.id, 'overall_score': assessment.overall_score,
            'recommended_action': assessment.recommended_action,
            'ai_available': assessment.ai_available}


HANDLERS = {'ingest': handle_ingest, 'analyze': handle_analyze}


def process_job(session: Session, job: Job) -> None:
    handler = HANDLERS.get(job.kind)
    if handler is None:
        queue.fail(session, job, f'unknown job kind "{job.kind}"')
        return
    try:
        result = handler(session, job.payload or {})
        queue.complete(session, job, result)
    except QuotaExceeded as exc:
        queue.fail(session, job, str(exc), retry_after=exc.retry_after)
    except (ProviderNotConfigured, CollectionNotPermitted) as exc:
        job.max_attempts = job.attempts  # non-retryable: configuration/authorization issue
        queue.fail(session, job, f'{type(exc).__name__}: {exc}')
    except Exception as exc:  # noqa: BLE001
        log.exception('job %s failed', job.public_id)
        queue.fail(session, job, f'{type(exc).__name__}: {exc}')


def run_once() -> int:
    processed = 0
    with session_scope() as session:
        job = queue.claim(session)
        if job is None:
            return 0
        process_job(session, job)
        processed = 1
    return processed


def main() -> None:
    parser = argparse.ArgumentParser(description='Darkmap worker')
    parser.add_argument('--once', action='store_true', help='drain the queue then exit')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s %(levelname)s %(name)s %(message)s')
    init_db()
    poll = get_settings().worker_poll_seconds
    log.info('darkmap worker started (poll=%.1fs)', poll)
    while True:
        try:
            did = run_once()
        except Exception:  # noqa: BLE001
            log.exception('worker loop error')
            did = 0
        if did == 0:
            if args.once:
                log.info('queue drained; exiting')
                return
            time.sleep(poll)


if __name__ == '__main__':
    main()
