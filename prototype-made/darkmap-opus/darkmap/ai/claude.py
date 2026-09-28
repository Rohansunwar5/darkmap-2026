'''Experiential Labs Claude Opus analysis provider (model: claude-opus-5).

Configured via EXPLABS_API_KEY (or the legacy EXPERIENTIAL_LABS_API_KEY alias) and
EXPERIENTIAL_LABS_BASE_URL.
Fails soft: on any error the risk engine falls back to heuristics-only and records the
reason as an explicit limitation on the assessment.
'''
import json
import random
import re
import time
from typing import Any, Dict, List, Optional

import httpx

from ..config import get_settings
from .base import AnalysisProvider, AnalysisResult, NullAnalysisProvider
from .prompts import ACTIONS, CATEGORIES, SYSTEM_PROMPT, build_user_prompt

JSON_BLOCK_RE = re.compile(r'\{.*\}', re.DOTALL)


def _clamp(value: Any, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


class ClaudeAnalysisProvider(AnalysisProvider):
    name = 'experiential_labs_claude'

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, client: Optional[httpx.Client] = None,
                 sleep=time.sleep):
        s = get_settings()
        self.api_key = api_key if api_key is not None else s.experiential_labs_api_key
        self.base_url = (base_url or s.experiential_labs_base_url).rstrip('/')
        self.model = model or s.analysis_model
        self.max_tokens = s.analysis_max_tokens
        self.timeout = s.analysis_timeout
        self.max_retries = s.max_retries
        self.backoff_base = s.backoff_base
        self.backoff_max = s.backoff_max
        self._client = client
        self._sleep = sleep

    # --- transport -------------------------------------------------------
    def _post(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f'{self.base_url}/chat/completions'
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'content-type': 'application/json',
            'User-Agent': get_settings().user_agent,
        }
        client = self._client or httpx.Client(timeout=self.timeout)
        owns = self._client is None
        try:
            last = None
            for attempt in range(self.max_retries + 1):
                resp = client.post(url, headers=headers, json=payload)
                if resp.status_code in (408, 429, 500, 502, 503, 504) and attempt < self.max_retries:
                    retry_after = resp.headers.get('Retry-After')
                    if retry_after and retry_after.isdigit():
                        delay = float(retry_after)
                    else:
                        delay = min(self.backoff_base * (2 ** attempt), self.backoff_max)
                        delay *= 0.5 + random.random() / 2
                    self._sleep(delay)
                    last = f'{resp.status_code} from analysis API'
                    continue
                if resp.status_code >= 400:
                    raise RuntimeError(f'analysis API error {resp.status_code}: {resp.text[:400]}')
                return resp.json()
            raise RuntimeError(last or 'analysis API retries exhausted')
        finally:
            if owns:
                client.close()

    @staticmethod
    def _text_of(body: Dict[str, Any]) -> str:
        content = body.get('content')
        if isinstance(content, list):
            return ''.join(b.get('text', '') for b in content if isinstance(b, dict))
        if isinstance(content, str):
            return content
        choices = body.get('choices') or []
        if choices:
            content = (choices[0].get('message') or {}).get('content', '')
            if isinstance(content, list):
                return ''.join(part.get('text', '') for part in content
                               if isinstance(part, dict))
            return content if isinstance(content, str) else ''
        return ''

    # --- public API ------------------------------------------------------
    def analyze(self, dossier: Dict[str, Any]) -> AnalysisResult:
        if not self.api_key:
            return NullAnalysisProvider().analyze(dossier)
        payload = {
            'model': self.model,
            'max_tokens': self.max_tokens,
            'temperature': 1.0,
            'reasoning_effort': 'low',
            'messages': [
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': build_user_prompt(dossier)},
            ],
        }
        try:
            body = self._post(payload)
            choices = body.get('choices') or []
            if not choices:
                raise ValueError('analysis API returned no choices')
            finish_reason = choices[0].get('finish_reason')
            if finish_reason != 'stop':
                raise ValueError(f'analysis response incomplete: finish_reason={finish_reason!r}')
            text = self._text_of(body)
            parsed = self._parse(text)
        except Exception as exc:  # fail soft
            return AnalysisResult(available=False, model=self.model,
                                  limitations=[f'ai_provider_error: {exc}'], error=str(exc))
        return self._to_result(parsed, raw={
            'model': self.model,
            'usage': body.get('usage') or {},
            'finish_reason': finish_reason,
        }, dossier=dossier)

    @staticmethod
    def _parse(text: str) -> Dict[str, Any]:
        text = (text or '').strip()
        if text.startswith('```'):
            text = text.strip('`')
            text = text.split('\n', 1)[1] if '\n' in text else text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = JSON_BLOCK_RE.search(text)
            if not match:
                raise ValueError('model did not return JSON')
            return json.loads(match.group(0))

    @staticmethod
    def _evidence_map(dossier: Dict[str, Any]) -> Dict[str, str]:
        '''Map citation paths to source text that actually exists in the dossier.'''
        fields: Dict[str, str] = {}
        for key, value in (dossier.get('account') or {}).items():
            if value is not None:
                fields[f'account.{key}'] = str(value)
        for idx, entity in enumerate(dossier.get('entities') or []):
            value = str(entity.get('value') or '')
            fields[f'entities[{idx}].value'] = value
            kind = str(entity.get('kind') or 'entity')
            source = str(entity.get('source_field') or '')
            fields[f'entities.{kind}[{source}]'] = value
        for pidx, post in enumerate(dossier.get('posts') or []):
            fields[f'posts[{pidx}].caption'] = str(post.get('caption') or '')
            for midx, media in enumerate(post.get('media') or []):
                fields[f'posts[{pidx}].media[{midx}].ocr_text'] = str(
                    media.get('ocr_text') or '')
            for cidx, comment in enumerate(post.get('comments') or []):
                fields[f'posts[{pidx}].comments[{cidx}].text'] = str(
                    comment.get('text') or '')
        for idx, observation in enumerate(dossier.get('media_analysis') or []):
            fields[f'media_analysis[{idx}]'] = json.dumps(observation, ensure_ascii=False,
                                                          sort_keys=True, default=str)
        return fields

    def _to_result(self, doc: Dict[str, Any], raw: Dict[str, Any],
                   dossier: Dict[str, Any]) -> AnalysisResult:
        cats = doc.get('category_scores') or {}
        category_scores = {c: _clamp(cats.get(c), 0, 100, 0.0) for c in CATEGORIES}
        evidence: List[Dict[str, Any]] = []
        evidence_map = self._evidence_map(dossier)
        raw_evidence = (doc.get('evidence') or [])[:60]
        discarded = 0
        for item in raw_evidence:
            if not isinstance(item, dict):
                discarded += 1
                continue
            field = str(item.get('field') or '')[:200]
            quote = str(item.get('quote') or '')[:240]
            source = evidence_map.get(field)
            normalized_quote = ' '.join(quote.casefold().split())
            normalized_source = ' '.join((source or '').casefold().split())
            if (item.get('category') not in CATEGORIES or not normalized_quote or
                    normalized_quote not in normalized_source):
                discarded += 1
                continue
            evidence.append({
                'source': 'ai',
                'category': item['category'],
                'signal': str(item.get('signal') or 'ai_observation')[:80],
                'field': field,
                'quote': quote,
                'weight': _clamp(item.get('weight'), 0, 1, 0.5),
                'rationale': str(item.get('rationale') or '')[:400],
            })
        limitations = [str(x)[:300] for x in (doc.get('limitations') or [])][:20]
        if discarded:
            limitations.append(f'discarded_{discarded}_ungrounded_ai_evidence_items')
        action = doc.get('recommended_action')
        confidence = _clamp(doc.get('confidence'), 0, 1, 0.5)
        if raw_evidence and not evidence:
            confidence = min(confidence, 0.35)
        return AnalysisResult(
            available=True,
            overall_score=_clamp(doc.get('overall_score'), 0, 100,
                                 max(category_scores.values()) if category_scores else 0.0),
            category_scores=category_scores,
            evidence=evidence,
            confidence=confidence,
            limitations=limitations[:20],
            recommended_action=action if action in ACTIONS else None,
            summary=str(doc.get('summary') or '')[:1200],
            model=self.model,
            raw=raw,
        )


def get_analysis_provider() -> AnalysisProvider:
    s = get_settings()
    if not s.ai_enabled:
        return NullAnalysisProvider('EXPLABS_API_KEY not configured; '
                                    'heuristics-only assessment')
    return ClaudeAnalysisProvider()
