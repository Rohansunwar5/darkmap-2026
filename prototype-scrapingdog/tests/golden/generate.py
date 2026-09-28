"""Record REF (Python) outputs that the JavaScript port must reproduce exactly (spec §13.3).

Run from the project root:  python tests/golden/generate.py
Standard library only. Loads REF files by path and stubs the third-party modules they import.
"""
import copy
import dataclasses
import datetime as dt
import difflib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import types

if os.environ.get('PYTHONHASHSEED') != '0':      # make set iteration reproducible
    raise SystemExit(subprocess.call([sys.executable, *sys.argv],
                                     env={**os.environ, 'PYTHONHASHSEED': '0'}))

ROOT = pathlib.Path(__file__).resolve().parents[2]
REF = pathlib.Path(os.environ.get('DARKMAP_REF') or
                   ROOT.parent / 'prototype-made' / 'darkmap-opus-team-share' / 'darkmap-opus')
FIX = ROOT / 'tests' / 'fixtures'
OUT = ROOT / 'tests' / 'golden'
FIXED_RETRIEVED_AT = '2026-09-23T00:00:00'


class _Stub:
    """Stands in for SQLAlchemy/FastAPI/httpx objects that the helpers below never call."""
    def __init__(self, *args, **kwargs): pass
    def __call__(self, *args, **kwargs): return _Stub()
    def __getattr__(self, name): return _Stub()


class _Error(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        self.status_code = kwargs.get('status_code')
        self.retry_after = kwargs.get('retry_after')


def _module(name, package=False, **attributes):
    module = types.ModuleType(name)
    if package:
        module.__path__ = []
    module.__dict__.update(attributes)
    sys.modules[name] = module
    return module


def _load(name, relative):
    spec = importlib.util.spec_from_file_location(name, REF / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name in ('darkmap', 'darkmap.ai', 'darkmap.providers'):
    _module(name, package=True)
_module('httpx', Client=_Stub, Response=_Stub, HTTPError=_Error, ReadTimeout=_Error)
_module('sqlalchemy', select=_Stub(), Text=_Stub(), cast=_Stub(), func=_Stub(), or_=_Stub())
_module('sqlalchemy.orm', Session=_Stub)
_module('fastapi', package=True)
_module('fastapi.testclient', TestClient=_Stub)
for name in ('darkmap.audit', 'darkmap.dossier', 'darkmap.intelligence', 'darkmap.cache'):
    _module(name, record=lambda *a, **k: None)
_module('darkmap.ai.claude', get_analysis_provider=lambda: None)
_module('darkmap.config', get_settings=lambda: types.SimpleNamespace(
    risk_ai_weight=0.5, analysis_model='claude-opus-5', bright_data_api_key='k',
    bright_data_serp_zone='z', bright_data_api_base='https://api.brightdata.com',
    bright_data_max_wait_seconds=90))
_module('darkmap.models', utcnow=lambda: dt.datetime(2026, 9, 23), **{n: _Stub for n in (
    'Account', 'Brand', 'Comment', 'Entity', 'MediaAsset', 'Post', 'RiskAssessment',
    'SearchDocument', 'QuotaCounter')})
_module('darkmap.normalize', ingest_bundle=_Stub(), reindex_account=_Stub())
_module('darkmap.quota', QuotaExceeded=_Error, consume=lambda *a, **k: None)
_module('darkmap.http', FetchFailed=_Error, SourceUnavailable=_Error, ManagedClient=_Stub,
        NotAuthorized=_Error)

extract = _load('darkmap.extract', 'darkmap/extract.py')
heuristics = _load('darkmap.ai.heuristics', 'darkmap/ai/heuristics.py')
base = _load('darkmap.ai.base', 'darkmap/ai/base.py')
_load('darkmap.providers.base', 'darkmap/providers/base.py')
export_file = _load('darkmap.providers.export_file', 'darkmap/providers/export_file.py')
risk = _load('darkmap.risk', 'darkmap/risk.py')
search = _load('darkmap.search', 'darkmap/search.py')
bright = _load('darkmap.providers.bright_data_instagram', 'darkmap/providers/bright_data_instagram.py')
pages = _load('darkmap.providers.instagram_pages', 'darkmap/providers/instagram_pages.py')

RECORDS = {'analyze': [], 'extract': [], 'domain_of': [], 'handle_similarity': []}
SOURCE = ['']


def _recording(kind, function):
    def wrapper(*args):
        result = function(*args)
        RECORDS[kind].append({'source': SOURCE[0], 'args': copy.deepcopy(list(args)),
                              'result': copy.deepcopy(result)})
        return result
    return wrapper


heuristics.analyze = _recording('analyze', heuristics.analyze)
heuristics.handle_similarity = _recording('handle_similarity', heuristics.handle_similarity)
extract.extract = _recording('extract', extract.extract)
extract.domain_of = _recording('domain_of', extract.domain_of)


def _plain(value):
    """Dataclasses and datetimes -> JSON-ready values (datetimes as Python isoformat())."""
    if dataclasses.is_dataclass(value):
        return {f.name: _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def _json(name, default):
    path = FIX / name
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def _write(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(_plain(value), ensure_ascii=False, indent=1) + '\n',
                            encoding='utf-8')


def _harvest(test_file):
    """Run REF's argument-free test functions; the wrappers above record every helper call."""
    module = _load('ref_' + pathlib.Path(test_file).stem, test_file)
    for name in sorted(vars(module)):
        function = getattr(module, name)
        if name.startswith('test_') and callable(function) and function.__code__.co_argcount == 0:
            SOURCE[0] = f'{test_file}::{name}'
            function()


def _provider(params=None):
    provider = bright.BrightDataInstagramProvider(None, params or {'mode': 'keyword', 'max_items': 250})
    provider._provenance = lambda mode, query: {
        'provider': provider.name, 'lawful_basis': provider.lawful_basis, 'collection_mode': mode,
        'query': query, 'source': 'Bright Data Instagram Scraper API', 'retrieved_at': FIXED_RETRIEVED_AT}
    return provider


def main():
    for test_file in ('tests/test_heuristics.py', 'tests/test_advanced_alerts.py',
                      'tests/test_extract_normalize.py'):
        _harvest(test_file)
    for path in sorted((FIX / 'dossiers').glob('*.json')):
        SOURCE[0] = f'fixtures/dossiers/{path.name}'
        heuristics.analyze(json.loads(path.read_text(encoding='utf-8')))
    for text in _json('texts.json', []):
        SOURCE[0] = 'fixtures/texts.json'
        extract.extract(text)
    for url in _json('urls.json', []):
        SOURCE[0] = 'fixtures/urls.json'
        extract.domain_of(url)
    for handle, names in _json('similarity-calls.json', []):
        SOURCE[0] = 'fixtures/similarity-calls.json'
        heuristics.handle_similarity(handle, names)

    cases = _json('pycompat-cases.json', {})
    _write('pycompat.json', {
        'round': [[x, n, round(x, n)] for x, n in cases.get('round', [])],
        'fixed': [[x, n, f'{x:.{n}f}'] for x, n in cases.get('fixed', [])],
        'repr': [[v, repr(v)] for v in cases.get('repr', [])],
        'sorted': [[v, sorted(v)] for v in cases.get('sorted', [])],
        'strip': [[s, s.strip()] for s in cases.get('strip', [])],
        'split': [[s, s.split()] for s in cases.get('split', [])],
        'lower': [[s, s.lower()] for s in cases.get('lower', [])],
        'casefold': [[s, s.casefold()] for s in cases.get('casefold', [])],
        'len': [[s, len(s)] for s in cases.get('len', [])],
        'slice': [[s, a, b, s[a:b]] for s, a, b in cases.get('slice', [])],
        'sum': [[v, sum(v)] for v in cases.get('sum', [])],
        'pow085': [0.85 ** i for i in range(6)],
    })
    _write('sequence-matcher.json', [
        [a, b, difflib.SequenceMatcher(None, a, b).ratio(),
         [list(m) for m in difflib.SequenceMatcher(None, a, b).get_matching_blocks()]]
        for a, b in _json('similarity-pairs.json', [])])
    _write('extract.json', RECORDS['extract'])
    _write('domain-of.json', RECORDS['domain_of'])
    _write('handle-similarity.json', RECORDS['handle_similarity'])
    _write('heuristics.json', RECORDS['analyze'])

    null = base.NullAnalysisProvider('paged_live_search: deterministic risk assessment').analyze({})
    rows = []
    for record in RECORDS['analyze']:
        dossier, heur = record['args'][0], record['result']
        fused = risk.fuse(heur, null, 0.5)
        confidence = risk.compute_confidence(heur, null, dossier)
        rows.append({'source': record['source'], 'dossier': dossier, 'heur': heur, 'fused': fused,
                     'confidence': confidence, 'limitations': risk._limitations(dossier, heur, null),
                     'trusted': risk._has_trusted_profile_context(dossier, heur),
                     'action': risk.recommend_action(fused['overall_score'],
                                                     fused['category_scores'], confidence),
                     'summary': risk._fallback_summary(dossier, fused, heur)})
    _write('risk-core.json', rows)
    _write('snippets.json', [[body, term, search._snippet(body, term)]
                             for body, term in _json('snippets.json', [])])
    _write('parse-ts.json', [[value, export_file.parse_ts(value)]
                             for value in _json('timestamps.json', [])])

    helpers = _json('discovery-helpers.json', {})
    _write('discovery-helpers.json', {
        'as_int': [[v, bright._as_int(v)] for v in helpers.get('as_int', [])],
        'serp_followers': [[v, bright._serp_followers(v)] for v in helpers.get('serp_followers', [])],
        'as_url': [[v, bright._as_url(v)] for v in helpers.get('as_url', [])],
        'looks_like_video_url': [[v, bright._looks_like_video_url(v)] for v in helpers.get('video', [])],
        'canonical': [[v, bright._canonical_instagram_url(v)] for v in helpers.get('urls', [])],
        'url_kind': [[v, bright._url_kind(v)] for v in helpers.get('canonical_urls', [])],
        'queries': [[k, bright._discovery_queries(k)] for k in helpers.get('keywords', [])],
    })
    parsers = []
    for path in sorted((FIX / 'nodes').glob('*.json')):
        node = json.loads(path.read_text(encoding='utf-8'))
        P = bright.BrightDataInstagramProvider
        parsers.append({'name': path.name, 'node': node, 'post': P._post(node),
                        'account': P._account(node, node.get('_fallback', '')),
                        'comment': P._comment(node, node.get('_parent')), 'author': P._author(node),
                        'media': P._media_items(node)})
    _write('parsers.json', parsers)
    buckets = []
    for path in sorted((FIX / 'organic').glob('*.json')):
        case = json.loads(path.read_text(encoding='utf-8'))
        provider = _provider({'mode': 'keyword', 'max_items': case.get('max_items', 250)})
        result = provider._bucket_discovery(case['organic'], case['keyword'])
        buckets.append({'name': path.name, 'case': case, 'buckets': result,
                        'serp_fallback': provider._serp_fallback})
    _write('bucket-discovery.json', buckets)
    core = []
    for path in sorted((FIX / 'checkpoints').glob('*.json')):
        state = json.loads(path.read_text(encoding='utf-8'))
        collector = pages.PagedInstagramCollector(None, copy.deepcopy(state))
        collector._provenance = _provider()._provenance
        bundles_before, buckets_before = collector._bundles()
        collector._schedule()
        core.append({'name': path.name, 'state': state, 'bundles': bundles_before,
                     'buckets': buckets_before, 'scheduled_state': collector.state,
                     'profile_pending': collector._profile_enrichment_pending(bundles_before),
                     'has_work': collector.has_work()})
    _write('collector-core.json', core)
    _write('hit-key.json', [[hit, pages.hit_key(hit)] for hit in _json('hits.json', [])])
    print({name: len(value) for name, value in RECORDS.items()})


if __name__ == '__main__':
    main()
