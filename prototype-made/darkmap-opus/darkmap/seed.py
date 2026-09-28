'''Create the schema and load sample seed data (offline, no network calls).'''
import json
import os
from typing import List

from sqlalchemy import select

from . import queue, risk
from .db import init_db, session_scope
from .models import Brand
from .normalize import ingest_bundle
from .providers.export_file import ExportFileProvider

SEED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'data', 'seed')


def seed_brands(session) -> List[Brand]:
    with open(os.path.join(SEED_DIR, 'brands.json'), 'r', encoding='utf-8') as fh:
        docs = json.load(fh)
    out = []
    for doc in docs:
        brand = session.scalar(select(Brand).where(Brand.name == doc['name']))
        if brand is None:
            brand = Brand(**doc)
            session.add(brand)
            session.flush()
        out.append(brand)
    return out


def main(analyze: bool = True) -> None:
    init_db()
    with session_scope() as session:
        brands = seed_brands(session)
        brand = brands[0] if brands else None
        files = sorted(f for f in os.listdir(SEED_DIR) if f.startswith('export_'))
        account_ids = []
        for name in files:
            path = os.path.join(SEED_DIR, name)
            provider = ExportFileProvider(session, {'path': path, 'supplied_by': 'seed_fixture',
                                                    'consent_reference': 'DARKMAP-SEED-001'})
            bundle = provider.fetch('')
            counts = ingest_bundle(session, bundle, brand=brand)
            account_ids.append(counts['account_id'])
            print(f"ingested {name}: account={counts['account_id']} posts={counts['posts']} "
                  f"media={counts['media']} comments={counts['comments']}")
        if analyze:
            for aid in account_ids:
                a = risk.assess_account(session, aid, brand_id=brand.id if brand else None)
                print(f'assessed account {aid}: score={a.overall_score} '
                      f'action={a.recommended_action} ai={a.ai_available}')
        else:
            for aid in account_ids:
                queue.enqueue(session, 'analyze', {'account_id': aid,
                                                   'brand_id': brand.id if brand else None})
    print('seed complete')


if __name__ == '__main__':
    main()
