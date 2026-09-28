"""Sequential, resumable collection using the original complete discovery plan.

A page owns at most 48 seconds of network work. Remaining queries, inputs, snapshots,
downloads and comments stay in the signed checkpoint, rather than becoming timeout losses.
No process-local job ID or SQLite row is needed to resume on another Vercel instance.
"""
import time
from collections import OrderedDict
from dataclasses import fields
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import httpx
from sqlalchemy import select

from .. import audit
from ..config import get_settings
from ..http import FetchFailed, ManagedClient, SourceUnavailable
from ..quota import QuotaExceeded
from ..models import QuotaCounter, utcnow
from .base import RawAccount, RawBundle
from .bright_data_instagram import (
    BrightDataInstagramProvider, PROFILE_DATASET, POST_DATASET, REEL_DATASET,
    COMMENT_DATASET, USERNAME_RE, _canonical_instagram_url, _discovery_queries,
    _records, _response_payload, _discovery_records,
)

PAGE_NETWORK_SECONDS = 48.0
POLL_SECONDS = 5.0


def hit_key(hit):
    # Numeric database IDs are request-local on serverless; never use them as page identities.
    if hit.get('doc_type') == 'account':
        return 'account:' + (hit.get('handle') or '').casefold()
    # The same shortcode may arrive as /p/code/, /reel/code/, or /author/reel/code/.
    return 'post:' + (hit.get('instagram_url') or '').rstrip('/').split('/')[-1]


class PagedInstagramCollector(BrightDataInstagramProvider):
    def __init__(self, session, state, client=None, sleep=time.sleep):
        super().__init__(session, state['params'], client=client, sleep=sleep)
        self.state = state
        self.settings = get_settings()
        self.state.setdefault('organic', [])
        self.state.setdefault('query_tasks', [dict(query=q, country=c, index=i, attempt=0)
                                             for i, (q, c) in enumerate(_discovery_queries(state['query']))])
        self.state.setdefault('inputs', [])
        self.state.setdefault('scheduled', {})
        self.state.setdefault('snapshots', [])
        self.state.setdefault('records', {})
        self.state.setdefault('errors', [])
        self.state.setdefault('queries_completed', 0)
        self.state.setdefault('blocked_until', 0)
        self.state.setdefault('profile_target', min(
            self._limit(), int(self.params.get('profile_limit', 50))))

    def _defer_refusal(self, error):
        if not isinstance(error, FetchFailed) or error.status_code not in (429, 503):
            return False
        delay = 30.0
        if error.retry_after:
            try:
                delay = max(0, float(error.retry_after))
            except ValueError:
                try:
                    delay = max(0, parsedate_to_datetime(error.retry_after).timestamp() - time.time())
                except (ValueError, TypeError, OverflowError):
                    pass
        self.state['blocked_until'] = time.time() + delay
        return True

    def _quota_checkpoint(self, restore=False):
        now = utcnow()
        windows = ['m:' + now.strftime('%Y%m%d%H%M'), 'd:' + now.strftime('%Y%m%d')]
        rows = {r.window: r for r in self.session.scalars(select(QuotaCounter).where(
            QuotaCounter.scope == self.name, QuotaCounter.window.in_(windows))).all()}
        if restore:
            for window, count in self.state.get('quota', {}).items():
                if window not in windows:
                    continue
                row = rows.get(window)
                if row is None:
                    self.session.add(QuotaCounter(scope=self.name, window=window, count=count))
                else:
                    row.count = max(row.count, count)
            self.session.flush()
        else:
            self.state['quota'] = {w: r.count for w, r in rows.items()}

    def _bundles(self):
        buckets = self._bucket_discovery(self.state['organic'], self.state['query'])
        # Search snippets stay explicitly marked as discovery evidence; full records overwrite
        # them as soon as a snapshot is ready. Generated usernames never become results alone.
        merged = OrderedDict((b.account.handle.casefold(), b) for b in self._serp_fallback)

        def add(bundle):
            key = bundle.account.handle.casefold()
            if not key:
                return
            current = merged.get(key)
            if current is None:
                merged[key] = bundle
                return
            for field in fields(RawAccount):
                value = getattr(bundle.account, field.name)
                if value is not None and value != {}:
                    setattr(current.account, field.name, value)
            posts = OrderedDict((p.permalink or p.platform_post_id, p) for p in current.posts)
            for post in bundle.posts:
                posts[post.permalink or post.platform_post_id] = post
            current.posts = list(posts.values())
            current.provenance = bundle.provenance

        provenance = self._provenance('keyword', self.state['query'])
        provenance['retrieved_at'] = self.state['retrieved_at']
        for node in self.state['records'].get(PROFILE_DATASET, []):
            account = self._account(node)
            add(RawBundle(account, [self._post(p) for p in (node.get('posts') or [])
                                    if isinstance(p, dict)][:self._limit()], provenance))
        for dataset in (POST_DATASET, REEL_DATASET):
            for node in self.state['records'].get(dataset, []):
                author = self._author(node)
                if not author:
                    continue
                key = author.casefold()
                media_account = self._account(node, author)
                if key not in merged:
                    merged[key] = RawBundle(media_account, [], provenance)
                else:
                    # Post/reel records also carry the author's followers, verification state,
                    # profile photo, biography, and profile metrics. Fill gaps left by the search
                    # snippet while preserving richer profile-dataset values already collected.
                    current_account = merged[key].account
                    for field in fields(RawAccount):
                        existing = getattr(current_account, field.name)
                        value = getattr(media_account, field.name)
                        placeholder_name = (
                            field.name == 'display_name' and isinstance(existing, str)
                            and existing.casefold().lstrip('@') == current_account.handle.casefold()
                        )
                        if (existing in (None, '') or placeholder_name) and value not in (None, '', {}):
                            setattr(current_account, field.name, value)
                bundle = merged[key]
                post = self._post(node)
                existing = {p.permalink: p for p in bundle.posts}
                existing[post.permalink] = post
                bundle.posts = list(existing.values())

        comments = {}
        for node in self.state['records'].get(COMMENT_DATASET, []):
            url = _canonical_instagram_url(str(node.get('post_url') or ''))
            if not url:
                continue
            parent = self._comment(node)
            comments.setdefault(url, []).append(parent)
            comments[url].extend(self._comment(r, parent.platform_comment_id)
                                 for r in (node.get('replies') or []) if isinstance(r, dict))
        for bundle in merged.values():
            for post in bundle.posts:
                # Retain embedded comments if the optional comment snapshot is still pending.
                combined = OrderedDict()
                for comment in post.comments + comments.get(post.permalink, []):
                    key = comment.platform_comment_id or (comment.author_handle, comment.text)
                    combined[key] = comment
                post.comments = list(combined.values())[:self.params.get('comments_per_post', 20)]
        return list(merged.values()), buckets

    def _schedule(self):
        bundles, buckets = self._bundles()
        # profile_limit is a per-result-page budget.  Increase the cumulative allowance as the
        # user requests later pages; otherwise the first 50 scheduled names permanently prevent
        # authors found in batches two through five from receiving profile metadata.
        profile_limit = min(self._limit(), int(self.state.get(
            'profile_target', self.params.get('profile_limit', 50))))
        # The exact brand and accounts already backed by search/post evidence need their public
        # profile details first. Otherwise speculative username probes can consume the profile
        # cap and leave visible results without avatars, follower counts, or biographies.
        exact_probe = buckets['probe_profile'][:1]
        evidence_profiles = [f'https://www.instagram.com/{bundle.account.handle}/'
                             for bundle in bundles if bundle.account.handle]
        # Speculative brand-pattern probes wait until discovery is exhausted. Scheduling all of
        # them at startup delayed details for accounts that were already present in real evidence.
        speculative = buckets['probe_profile'][1:] if not self.state['query_tasks'] else []
        profile_candidates = list(dict.fromkeys(
            exact_probe + evidence_profiles + buckets['profile'] + speculative))
        known_profiles = self.state['scheduled'].setdefault(PROFILE_DATASET, [])
        remaining_profiles = max(0, profile_limit - len(known_profiles))
        profiles = [url for url in profile_candidates
                    if url.rstrip('/').split('/')[-1] not in known_profiles][:remaining_profiles]
        plan = [(PROFILE_DATASET, [dict(user_name=u.rstrip('/').split('/')[-1]) for u in profiles]),
                (POST_DATASET, [dict(url=u) for u in buckets['post'][:self._limit()]]),
                (REEL_DATASET, [dict(url=u) for u in buckets['reel'][:self._limit()]])]
        if self.params.get('include_comments', True):
            urls = list(dict.fromkeys(p.permalink for b in bundles for p in b.posts if p.permalink))
            plan.append((COMMENT_DATASET, [dict(url=u) for u in urls[:self._limit()]]))
        for dataset, inputs in plan:
            known = self.state['scheduled'].setdefault(dataset, [])
            new = [item for item in inputs if next(iter(item.values())) not in known]
            # Discovery runs one query at a time.  Coalesce newly discovered profiles into the
            # last untriggered request instead of creating many one-account snapshots.  Full
            # 20-account requests complete sooner and leave more polling time in the page budget.
            if dataset == PROFILE_DATASET and new:
                pending = next((task for task in reversed(self.state['inputs'])
                                if task['dataset'] == PROFILE_DATASET
                                and not task.get('attempt')
                                and task.get('discover_by', 'user_name') == 'user_name'
                                and len(task['inputs']) < 20), None)
                if pending:
                    room = 20 - len(pending['inputs'])
                    pending['inputs'].extend(new[:room])
                    known.extend(next(iter(item.values())) for item in new[:room])
                    new = new[room:]
            for start in range(0, len(new), 20):
                chunk = new[start:start + 20]
                self.state['inputs'].append(dict(dataset=dataset, inputs=chunk, attempt=0))
                known.extend(next(iter(item.values())) for item in chunk)

    def _profile_enrichment_pending(self, bundles):
        missing = any(
            bundle.account.handle and (
                not bundle.account.profile_pic_url or bundle.account.followers_count is None)
            for bundle in bundles
        )
        if not missing:
            return False
        return (any(task['dataset'] == PROFILE_DATASET for task in self.state['inputs']) or
                any(task['dataset'] == PROFILE_DATASET for task in self.state['snapshots']))

    def _discover_one(self, client):
        task = self.state['query_tasks'][0]
        url = ('https://www.google.com/search?q=' + quote_plus(task['query']) +
               '&hl=en&gl=' + task['country'])
        critical = task['index'] < 5
        if critical:
            url += '&num=20&filter=0'
        if task['attempt']:
            url += '&start=0'
        try:
            response = client.post(self.settings.bright_data_api_base + '/request',
                headers=self._headers(), json={'zone': self.settings.bright_data_serp_zone,
                    'url': url, 'format': 'raw', 'data_format': 'parsed' if critical else 'parsed_light'},
                use_cache=task['attempt'] == 0, max_retries=0)
            organic = _discovery_records(response)
            if critical and not organic and task['attempt'] == 0:
                task['attempt'] += 1
                return
            self.state['organic'].extend(organic)
            self.state['query_tasks'].pop(0)
            self.state['queries_completed'] += 1
            audit.record(self.session, action='ingest.discover.page', provider=self.name,
                         target=self.state['query'], status='ok', lawful_basis=self.lawful_basis,
                         detail={'query_index': task['index'], 'organic_results': len(organic)})
        except SourceUnavailable:
            raise
        except (FetchFailed, ValueError) as exc:
            if self._defer_refusal(exc):
                return
            task['attempt'] += 1
            if task['attempt'] >= 3:
                self.state['query_tasks'].pop(0)
                self.state['errors'].append({'stage': 'discovery', 'index': task['index'],
                                             'error': str(exc)[:300]})

    def _trigger_one(self, client):
        # Keep several profile-detail snapshots active so follower counts, verification, and
        # avatars arrive in the same page as discovery evidence. A single slow exact-profile
        # snapshot used to block enrichment for every account discovered after it.
        active_profiles = sum(task['dataset'] == PROFILE_DATASET
                              for task in self.state['snapshots'])
        profile_index = next((i for i, task in enumerate(self.state['inputs'])
                              if task['dataset'] == PROFILE_DATASET), None)
        content_index = next((i for i, task in enumerate(self.state['inputs'])
                              if task['dataset'] in (POST_DATASET, REEL_DATASET)), None)
        if profile_index is not None and active_profiles < 4:
            index = profile_index
        elif content_index is not None:
            index = content_index
        else:
            index = 0
        task = self.state['inputs'][index]
        params = {'dataset_id': task['dataset'], 'include_errors': 'true'}
        if (task['dataset'] == PROFILE_DATASET
                and task.get('discover_by', 'user_name') == 'user_name'):
            params.update(type='discover_new',
                          discover_by='user_name')
        try:
            response = client.post(self.settings.bright_data_api_base + '/datasets/v3/trigger',
                params=params, json=task['inputs'], headers=self._headers(), use_cache=False,
                max_retries=0)
            payload = _response_payload(response)
            if not isinstance(payload, dict) or not payload.get('snapshot_id'):
                raise FetchFailed('Collection did not return a snapshot identifier')
            self.state['snapshots'].append(dict(
                dataset=task['dataset'], id=str(payload['snapshot_id']), ready=False,
                next_poll=0, failures=0, inputs=task.get('inputs', []),
                attempt=task.get('attempt', 0),
                discover_by=task.get('discover_by', 'user_name')))
            self.state['inputs'].pop(index)
        except SourceUnavailable:
            raise
        except (FetchFailed, ValueError) as exc:
            if self._defer_refusal(exc):
                return
            task['attempt'] += 1
            if task['attempt'] >= 3:
                self.state['inputs'].pop(index)
                self.state['errors'].append({'stage': 'trigger', 'error': str(exc)[:300]})

    def _retry_profile_as_urls(self, task, returned=()):
        """Retry missing or incomplete username discoveries once by canonical profile URL."""
        if task.get('dataset') != PROFILE_DATASET or task.get('attempt'):
            return
        complete = {str(value).casefold().lstrip('@') for value in returned if value}
        requested = [str(item.get('user_name') or '').lstrip('@')
                     for item in task.get('inputs', []) if item.get('user_name')]
        missing = [name for name in requested if name.casefold() not in complete]
        if missing:
            self.state['inputs'].insert(0, dict(
                dataset=PROFILE_DATASET,
                inputs=[{'url': f'https://www.instagram.com/{name}/'} for name in missing],
                attempt=1, discover_by='url'))

    def _poll_one(self, client, task):
        task['next_poll'] = time.time() + POLL_SECONDS
        try:
            if not task['ready']:
                response = client.get(self.settings.bright_data_api_base + '/datasets/v3/progress/' + task['id'],
                    headers=self._headers(), use_cache=False, consume_quota=False, max_retries=0)
                status = str((response.json() or {}).get('status', '')).lower()
                if status in ('failed', 'error', 'cancelled', 'canceled'):
                    self.state['snapshots'].remove(task)
                    self._retry_profile_as_urls(task)
                    self.state['errors'].append({'stage': 'snapshot', 'error': status})
                    return
                task['ready'] = status in ('ready', 'completed', 'done', 'success')
                # Download in the next loop, where the wall-clock budget is checked again.
                if task['ready']:
                    task['next_poll'] = 0
                return
            response = client.get(self.settings.bright_data_api_base + '/datasets/v3/snapshot/' + task['id'],
                params={'format': 'json'}, headers=self._headers(), use_cache=False, max_retries=0)
            payload = _response_payload(response)
            if not isinstance(payload, (list, dict)):
                raise ValueError('Invalid collection snapshot')
            records = _records(payload)
            self.state['records'].setdefault(task['dataset'], []).extend(records)
            # Some accounts return no row when discovered by username even though the same
            # public profile is available through its canonical URL. Retry only the missing
            # names once with URL discovery; this repairs incomplete metadata without
            # restarting any completed search or content collection.
            accounts = [self._account(node) for node in records]
            complete = [account.handle for account in accounts
                        if account.handle and account.profile_pic_url
                        and account.followers_count is not None]
            self._retry_profile_as_urls(task, complete)
            self.state['snapshots'].remove(task)
        except SourceUnavailable:
            raise
        except (FetchFailed, ValueError) as exc:
            if self._defer_refusal(exc):
                return
            # A temporary read/download failure never deletes a pending snapshot.
            task['failures'] += 1
            task['next_poll'] = time.time() + min(30, 5 * 2 ** min(task['failures'], 3))

    def has_work(self):
        return bool(self.state['query_tasks'] or self.state['inputs'] or self.state['snapshots'])

    def collect(self, target_results=50, budget=PAGE_NETWORK_SECONDS):
        self.check_configuration()
        # Retain all work on account failures. An explicit retry rechecks access once.
        self.state.pop('source_error', None)
        stop_at = time.monotonic() + budget
        page_profile_limit = max(0, min(50, int(self.params.get('profile_limit', 50))))
        requested_pages = max(1, (int(target_results) + 49) // 50)
        self.state['profile_target'] = min(
            self._limit(), max(int(self.state.get('profile_target', 0)),
                               page_profile_limit * requested_pages))
        self._quota_checkpoint(restore=True)
        self._schedule()
        turns = 0
        with ManagedClient(self.session, self.name, self.lawful_basis,
                           client=self._client, sleep=self._sleep, request_timeout=12.0,
                           allow_cache=False) as client:
            while self.has_work() and time.monotonic() < stop_at - 12.0:
                bundles, _ = self._bundles()
                count = len(bundles) + len({p.permalink.rstrip('/').split('/')[-1] for b in bundles for p in b.posts if p.permalink})
                if count >= target_results and not self._profile_enrichment_pending(bundles):
                    break
                if self.state['blocked_until'] > time.time():
                    break
                # Profile metadata directly controls trust and ranking. Poll a ready profile
                # snapshot before content snapshots so follower counts and verified state are
                # applied before the page is scored.
                due_profile = next((t for t in self.state['snapshots']
                                    if t['dataset'] == PROFILE_DATASET
                                    and t['next_poll'] <= time.time()), None)
                due = due_profile or next((t for t in self.state['snapshots']
                                           if t['next_poll'] <= time.time()), None)
                try:
                    # Interleave the original sequential plan with snapshots already collecting.
                    # Limit active snapshots so progress polling cannot consume the page quota.
                    if self.state['inputs'] and len(self.state['snapshots']) < 6 and turns % 3 == 0:
                        self._trigger_one(client)
                    elif due and (turns % 3 == 1 or not self.state['query_tasks']):
                        self._poll_one(client, due)
                    elif self.state['query_tasks']:
                        self._discover_one(client)
                    elif self.state['inputs'] and len(self.state['snapshots']) < 6:
                        self._trigger_one(client)
                    elif due:
                        self._poll_one(client, due)
                    else:
                        self._sleep(min(1, max(0, stop_at - time.monotonic() - 12)))
                    self._schedule()
                except SourceUnavailable as exc:
                    self.state['source_error'] = {'code': exc.code, 'message': str(exc)}
                    audit.record(self.session, action='ingest.source_blocked', provider=self.name,
                                 target=self.state['query'], status='blocked',
                                 detail={'code': exc.code})
                    break
                except QuotaExceeded as exc:
                    self.state['blocked_until'] = time.time() + exc.retry_after
                    break
                turns += 1
        self._quota_checkpoint()
        return self._bundles()[0]
