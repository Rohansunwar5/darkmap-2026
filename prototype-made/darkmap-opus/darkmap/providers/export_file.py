'''Ingest a user-provided export (JSON) or a licensed dataset file.

This is the highest-assurance path: the data subject or brand owner supplies the file,
so no platform access is required at all.
'''
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .. import audit
from ..config import get_settings
from .base import (CollectionNotPermitted, IngestionProvider, ProviderNotConfigured, RawAccount,
                   RawBundle, RawComment, RawMedia, RawPost)


def parse_ts(value: Any) -> Optional[dt.datetime]:
    if value in (None, ''):
        return None
    if isinstance(value, (int, float)):
        return dt.datetime.utcfromtimestamp(float(value))
    text = str(value).replace('Z', '+00:00')
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
            try:
                parsed = dt.datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return parsed


def bundle_from_dict(doc: Dict[str, Any], provenance: Dict[str, Any]) -> RawBundle:
    acc = doc.get('account') or doc.get('profile') or {}
    account = RawAccount(
        handle=(acc.get('handle') or acc.get('username') or '').lstrip('@'),
        platform=acc.get('platform', 'instagram'),
        platform_account_id=str(acc['id']) if acc.get('id') is not None else None,
        display_name=acc.get('display_name') or acc.get('full_name'),
        biography=acc.get('biography') or acc.get('bio'),
        external_url=acc.get('external_url') or acc.get('website'),
        profile_pic_url=acc.get('profile_pic_url'),
        is_verified=acc.get('is_verified'),
        is_business=acc.get('is_business'),
        followers_count=acc.get('followers_count'),
        follows_count=acc.get('follows_count'),
        media_count=acc.get('media_count'),
        account_created_at=parse_ts(acc.get('created_at')),
        raw=acc,
    )
    posts: List[RawPost] = []
    for p in doc.get('posts', []) or []:
        media = [RawMedia(
            media_type=m.get('media_type'), media_url=m.get('media_url'),
            thumbnail_url=m.get('thumbnail_url'), width=m.get('width'), height=m.get('height'),
            duration_seconds=m.get('duration_seconds'), mime_type=m.get('mime_type'),
            byte_size=m.get('byte_size'), perceptual_hash=m.get('perceptual_hash'),
            ocr_text=m.get('ocr_text'), transcript=m.get('transcript'),
            qr_payloads=m.get('qr_payloads') or [],
            brand_match_score=m.get('brand_match_score'),
            synthetic_media_score=m.get('synthetic_media_score'), exif=m.get('exif') or {},
        ) for m in (p.get('media') or [])]
        comments = [RawComment(
            platform_comment_id=str(c.get('id')) if c.get('id') is not None else None,
            parent_platform_comment_id=(str(c.get('parent_id'))
                                        if c.get('parent_id') is not None else None),
            author_handle=(c.get('author_handle') or c.get('username') or '').lstrip('@') or None,
            text=c.get('text'), like_count=c.get('like_count'),
            created_at=parse_ts(c.get('created_at') or c.get('timestamp')),
        ) for c in (p.get('comments') or [])]
        posts.append(RawPost(
            platform_post_id=str(p.get('id')) if p.get('id') is not None else p.get('shortcode'),
            shortcode=p.get('shortcode'),
            post_type=p.get('post_type') or p.get('media_product_type') or 'post',
            permalink=p.get('permalink'), caption=p.get('caption'),
            posted_at=parse_ts(p.get('posted_at') or p.get('timestamp')),
            like_count=p.get('like_count'), comment_count=p.get('comment_count'),
            view_count=p.get('view_count') or p.get('play_count'),
            share_count=p.get('share_count'), language=p.get('language'),
            media=media, comments=comments, raw=p))
    return RawBundle(account=account, posts=posts, provenance=provenance)


class ExportFileProvider(IngestionProvider):
    name = 'export_file'
    lawful_basis = 'user_export'

    def check_configuration(self) -> None:
        path = self.params.get('path')
        inline = self.params.get('document')
        if not path and inline is None:
            raise ProviderNotConfigured("export_file requires params.path or params.document")
        if path:
            root = Path(self.params.get('root') or os.getcwd()).resolve()
            full = Path(path).resolve()
            if full != root and root not in full.parents:
                raise CollectionNotPermitted('export path escapes the configured root directory')
            if not os.path.exists(full):
                raise ProviderNotConfigured(f'export file not found: {path}')
            if full.stat().st_size > get_settings().max_export_bytes:
                raise CollectionNotPermitted('export file exceeds DARKMAP_MAX_EXPORT_BYTES')

    def fetch(self, handle: str) -> RawBundle:
        self.check_configuration()
        path = self.params.get('path')
        if path:
            with open(path, 'r', encoding='utf-8') as fh:
                doc = json.load(fh)
            source = os.path.abspath(path)
        else:
            doc = self.params['document']
            source = 'inline'
        provenance = {
            'provider': self.name,
            'lawful_basis': self.lawful_basis,
            'source': source,
            'supplied_by': self.params.get('supplied_by', 'operator'),
            'consent_reference': self.params.get('consent_reference'),
        }
        bundle = bundle_from_dict(doc, provenance)
        if handle and not bundle.account.handle:
            bundle.account.handle = handle.lstrip('@')
        audit.record(self.session, action='ingest.fetch', provider=self.name,
                     target=bundle.account.handle, status='ok',
                     lawful_basis=self.lawful_basis,
                     detail={'posts': len(bundle.posts), 'source': source})
        return bundle
