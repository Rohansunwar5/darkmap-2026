"""Signed, compressed search checkpoints that survive serverless cold starts.

Only public collection data lives in a checkpoint. Credentials are never included. HMAC
binds the query, pending snapshot IDs, evidence and pagination position to this deployment.
The browser treats the checkpoint as opaque and sends it back only to Darkmap.
"""
import base64
import hashlib
import hmac
import json
import time
import zlib

from .config import get_settings

MAX_TOKEN_BYTES = 1_800_000
MAX_STATE_BYTES = 24_000_000


class InvalidSearchCursor(ValueError):
    pass


def _key():
    settings = get_settings()
    secret = settings.search_cursor_secret or settings.bright_data_api_key
    if not secret:
        raise InvalidSearchCursor('Search continuation is not configured')
    return hmac.digest(secret.encode(), b'darkmap-search-cursor-v1', 'sha256')


def encode_cursor(state):
    raw = json.dumps(state, separators=(',', ':'), ensure_ascii=False).encode()
    if len(raw) > MAX_STATE_BYTES:
        raise InvalidSearchCursor('Search checkpoint is too large; narrow the search')
    body = base64.urlsafe_b64encode(zlib.compress(raw, 6)).rstrip(b'=').decode()
    signature = hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()
    token = body + '.' + signature
    if len(token) > MAX_TOKEN_BYTES:
        raise InvalidSearchCursor('Search checkpoint is too large; narrow the search')
    return token


def decode_cursor(token):
    try:
        if len(token) > MAX_TOKEN_BYTES:
            raise ValueError('size')
        body, signature = token.rsplit('.', 1)
        expected = hmac.new(_key(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError('signature')
        compressed = base64.urlsafe_b64decode(body + '=' * (-len(body) % 4))
        decoder = zlib.decompressobj()
        raw = decoder.decompress(compressed, MAX_STATE_BYTES + 1)
        if len(raw) > MAX_STATE_BYTES or not decoder.eof:
            raise ValueError('size')
        state = json.loads(raw)
        if state.get('version') != 1 or state['expires_at'] <= time.time():
            raise ValueError('expired')
        return state
    except (ValueError, KeyError, TypeError, zlib.error) as exc:
        raise InvalidSearchCursor('Search continuation is invalid or expired. Start a new search.') from exc
