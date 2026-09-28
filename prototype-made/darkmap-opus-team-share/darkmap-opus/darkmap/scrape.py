'''Run the authorized Instagram collector directly from the command line.'''
import argparse
import json
from typing import Any, Dict

from . import risk
from .db import init_db, session_scope
from .models import Brand
from .normalize import ingest_bundle
from .providers import get_provider


def run(args) -> Dict[str, Any]:
    params = {
        'mode': args.mode,
        'max_items': args.max_items,
        'page_size': args.page_size,
        'max_pages': args.max_pages,
        'include_comments': not args.no_comments,
        'comments_per_post': args.comments_per_post,
    }
    with session_scope() as session:
        brand = session.get(Brand, args.brand_id) if args.brand_id else None
        if args.brand_id and brand is None:
            raise ValueError(f'brand {args.brand_id} not found')
        provider = get_provider('instagram_graph', session, params)
        bundles = provider.fetch_many(args.query or '')
        imported = []
        for bundle in bundles:
            counts = ingest_bundle(session, bundle, brand=brand)
            item: Dict[str, Any] = dict(counts)
            item['handle'] = bundle.account.handle
            if args.analyze:
                assessment = risk.assess_account(
                    session, counts['account_id'], brand_id=args.brand_id)
                item['assessment'] = {
                    'id': assessment.id,
                    'score': assessment.overall_score,
                    'confidence': assessment.confidence,
                    'action': assessment.recommended_action,
                    'ai_available': assessment.ai_available,
                }
            imported.append(item)
        return {'mode': args.mode, 'query': args.query, 'account_count': len(imported),
                'accounts': imported}


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Collect authorized Instagram data through Meta Graph API')
    parser.add_argument('mode', choices=(
        'account', 'owned', 'hashtag_recent', 'hashtag_top', 'tagged'))
    parser.add_argument('query', nargs='?', default='',
                        help='username for account mode or hashtag for hashtag modes')
    parser.add_argument('--brand-id', type=int)
    parser.add_argument('--max-items', type=int, default=100)
    parser.add_argument('--page-size', type=int, default=50)
    parser.add_argument('--max-pages', type=int, default=10)
    parser.add_argument('--comments-per-post', type=int, default=50)
    parser.add_argument('--no-comments', action='store_true')
    parser.add_argument('--analyze', action='store_true',
                        help='run Claude/rules risk analysis after collection')
    args = parser.parse_args()
    if args.mode in ('account', 'hashtag_recent', 'hashtag_top') and not args.query:
        parser.error(f'{args.mode} requires a username or hashtag query')
    init_db()
    print(json.dumps(run(args), indent=2, default=str))


if __name__ == '__main__':
    main()
