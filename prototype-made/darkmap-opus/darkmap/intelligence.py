'''Persistent investigation intelligence: change history, evidence and campaign clustering.'''
import hashlib
import json
import re
import datetime as dt
from collections import defaultdict
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .models import (Account, AccountSnapshot, Campaign, CampaignMember, Entity,
                     EvidenceArtifact, MediaAsset, Post, RiskAssessment, utcnow)

PIVOT_KINDS = {'url', 'email', 'phone', 'upi', 'crypto_wallet', 'telegram', 'download'}
PROFILE_FIELDS = ('handle', 'display_name', 'biography', 'external_url', 'profile_pic_url')


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str,
                      separators=(',', ':'))


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode('utf-8')).hexdigest()


def profile_state(account: Account) -> Dict[str, Any]:
    return {field: getattr(account, field) for field in PROFILE_FIELDS} | {
        'is_verified': bool(account.is_verified),
        'followers_count': account.followers_count,
        'follows_count': account.follows_count,
        'media_count': account.media_count,
    }


def profile_changes(session: Session, account: Account) -> List[Dict[str, Any]]:
    previous = session.scalar(select(AccountSnapshot).where(
        AccountSnapshot.account_id == account.id).order_by(desc(AccountSnapshot.id)).limit(1))
    if not previous:
        return []
    current = profile_state(account)
    changes = []
    for field in PROFILE_FIELDS:
        before, after = (previous.state or {}).get(field), current.get(field)
        if before != after:
            changes.append({'field': field, 'before': before, 'after': after,
                            'observed_at': utcnow().isoformat()})
    return changes


def shared_artifact_context(session: Session, account_id: int) -> List[Dict[str, Any]]:
    own = session.scalars(select(Entity).where(
        Entity.account_id == account_id, Entity.kind.in_(PIVOT_KINDS))).all()
    by_pair = {(entity.kind, entity.value_lower): entity.value for entity in own
               if entity.value_lower}
    if not by_pair:
        return []
    values = list({pair[1] for pair in by_pair})[:300]
    matches = session.scalars(select(Entity).where(
        Entity.account_id != account_id, Entity.kind.in_(PIVOT_KINDS),
        Entity.value_lower.in_(values))).all()
    accounts: Dict[tuple, set] = defaultdict(set)
    for entity in matches:
        pair = (entity.kind, entity.value_lower)
        if pair in by_pair:
            accounts[pair].add(entity.account_id)

    out = []
    for pair, linked in accounts.items():
        out.append({'kind': pair[0], 'value': by_pair[pair],
                    'linked_account_ids': sorted(linked), 'account_count': len(linked) + 1})

    # Exact perceptual hashes and copied captions connect accounts even without shared links.
    own_hashes = session.scalars(select(MediaAsset.perceptual_hash).join(Post).where(
        Post.account_id == account_id, MediaAsset.perceptual_hash.is_not(None))).all()
    for media_hash in sorted(set(filter(None, own_hashes))):
        linked = set(session.scalars(select(Post.account_id).join(MediaAsset).where(
            Post.account_id != account_id, MediaAsset.perceptual_hash == media_hash)).all())
        if linked:
            out.append({'kind': 'media_hash', 'value': media_hash,
                        'linked_account_ids': sorted(linked), 'account_count': len(linked) + 1})

    own_captions = session.scalars(select(Post.caption_lower).where(
        Post.account_id == account_id, Post.caption_lower.is_not(None))).all()
    for caption in {re.sub(r'\s+', ' ', value).strip() for value in own_captions
                    if value and len(value.strip()) >= 40}:
        linked = set(session.scalars(select(Post.account_id).where(
            Post.account_id != account_id, Post.caption_lower == caption)).all())
        if linked:
            out.append({'kind': 'caption_template', 'value': caption[:240],
                        'linked_account_ids': sorted(linked), 'account_count': len(linked) + 1})
    return sorted(out, key=lambda item: (-item['account_count'], item['kind'], item['value']))[:50]


def velocity_context(session: Session, account: Account) -> Dict[str, Any]:
    now = utcnow()
    posts = session.scalars(select(Post).where(Post.account_id == account.id)).all()
    def observed(value):
        return value.replace(tzinfo=None) if value and value.tzinfo else value
    last_24h = sum(1 for post in posts if observed(post.posted_at) and
                   observed(post.posted_at) >= now - dt.timedelta(hours=24))
    last_hour = sum(1 for post in posts if observed(post.posted_at) and
                    observed(post.posted_at) >= now - dt.timedelta(hours=1))
    snapshots = session.scalars(select(AccountSnapshot).where(
        AccountSnapshot.account_id == account.id).order_by(desc(AccountSnapshot.id)).limit(2)).all()
    follower_delta = None
    if snapshots:
        previous = (snapshots[0].state or {}).get('followers_count')
        current = account.followers_count
        if isinstance(previous, int) and isinstance(current, int):
            follower_delta = current - previous
    captions = [re.sub(r'\s+', ' ', post.caption_lower or '').strip() for post in posts]
    duplicated = len(captions) - len(set(caption for caption in captions if caption))
    return {'posts_last_hour': last_hour, 'posts_last_24h': last_24h,
            'follower_delta': follower_delta, 'duplicate_post_count': max(0, duplicated)}


def enrich_dossier(session: Session, account: Account, dossier: Dict[str, Any]) -> None:
    dossier['account_changes'] = profile_changes(session, account)
    dossier['shared_artifacts'] = shared_artifact_context(session, account.id)
    dossier['velocity'] = velocity_context(session, account)


def _capture_snapshot(session: Session, account: Account,
                      changes: List[Dict[str, Any]]) -> AccountSnapshot:
    state = profile_state(account)
    fingerprint = _hash(state)
    latest = session.scalar(select(AccountSnapshot).where(
        AccountSnapshot.account_id == account.id).order_by(desc(AccountSnapshot.id)).limit(1))
    if latest and latest.fingerprint == fingerprint:
        return latest
    snapshot = AccountSnapshot(account_id=account.id, fingerprint=fingerprint,
                               state=state, changes=changes)
    session.add(snapshot)
    session.flush()
    return snapshot


def _post_id_from_field(field: str) -> Optional[int]:
    match = re.search(r'posts\[(\d+)\]', field or '')
    return int(match.group(1)) if match else None


def preserve_evidence(session: Session, assessment: RiskAssessment,
                      dossier: Dict[str, Any]) -> List[EvidenceArtifact]:
    post_ids = [post.get('id') for post in dossier.get('posts') or []]
    post_urls = {post.get('id'): post.get('permalink') for post in dossier.get('posts') or []}
    account = dossier.get('account') or {}
    account_url = f"https://www.instagram.com/{account.get('handle')}/" if account.get('handle') else None
    created = []
    seen = set()
    for evidence in assessment.evidence or []:
        if float(evidence.get('weight') or 0) < 0.45:
            continue
        idx = _post_id_from_field(str(evidence.get('field') or ''))
        post_id = post_ids[idx] if idx is not None and idx < len(post_ids) else None
        payload = {'assessment_id': assessment.id, 'evidence': evidence,
                   'account': account, 'captured_at': utcnow().isoformat()}
        content_hash = _hash(payload)
        if content_hash in seen:
            continue
        seen.add(content_hash)
        artifact = EvidenceArtifact(
            assessment_id=assessment.id, account_id=assessment.account_id, post_id=post_id,
            kind='risk_signal', source_url=post_urls.get(post_id) or account_url,
            content_hash=content_hash, payload=payload,
            provenance=dossier.get('provenance') or {})
        session.add(artifact)
        created.append(artifact)
    session.flush()
    return created


def cluster_campaign(session: Session, assessment: RiskAssessment,
                     dossier: Dict[str, Any]) -> Optional[Campaign]:
    shared = dossier.get('shared_artifacts') or []
    if not shared:
        return None
    strongest = shared[0]
    cluster_key = _hash({'brand_id': assessment.brand_id, 'kind': strongest['kind'],
                         'value': strongest['value']})
    campaign = session.scalar(select(Campaign).where(Campaign.cluster_key == cluster_key))
    linked_ids = {assessment.account_id}
    for artifact in shared:
        linked_ids.update(artifact.get('linked_account_ids') or [])
    if campaign is None:
        label = str(strongest['value'])[:80]
        campaign = Campaign(cluster_key=cluster_key, brand_id=assessment.brand_id,
                            name=f"Shared {strongest['kind']}: {label}",
                            shared_artifacts=shared,
                            summary=f'{len(linked_ids)} accounts share investigation pivots.')
        session.add(campaign)
        session.flush()
    campaign.last_seen_at = utcnow()
    campaign.severity = max(float(campaign.severity or 0), float(assessment.overall_score))
    campaign.dimensions = assessment.dimensions or {}
    campaign.shared_artifacts = shared
    campaign.summary = f'{len(linked_ids)} accounts share {len(shared)} infrastructure, payment, media, or content pivots.'
    for account_id in linked_ids:
        exists = session.scalar(select(CampaignMember).where(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.account_id == account_id))
        if exists is None:
            reasons = [item for item in shared if account_id == assessment.account_id or
                       account_id in (item.get('linked_account_ids') or [])]
            session.add(CampaignMember(campaign_id=campaign.id, account_id=account_id,
                                       match_reasons=reasons,
                                       confidence=min(0.95, 0.55 + 0.08 * len(reasons))))
    session.flush()
    return campaign


def finalize_assessment(session: Session, account: Account, assessment: RiskAssessment,
                        dossier: Dict[str, Any]) -> Dict[str, Any]:
    snapshot = _capture_snapshot(session, account, dossier.get('account_changes') or [])
    artifacts = preserve_evidence(session, assessment, dossier)
    campaign = cluster_campaign(session, assessment, dossier)
    return {'snapshot_id': snapshot.id, 'evidence_artifacts': len(artifacts),
            'campaign_id': campaign.public_id if campaign else None}
