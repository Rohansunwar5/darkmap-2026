import boto3
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import ChannelInvalidError, ChannelPrivateError, FloodWaitError
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.types import InputPeerUser
from botocore.exceptions import ClientError
import json
import os
import random

# ── AWS / DynamoDB config ─────────────────────────────────────────────────────
aws_region = 'us-east-1'
dynamodb = boto3.resource('dynamodb', region_name=aws_region)
table = dynamodb.Table('TelegramSessions')

# ── Config ────────────────────────────────────────────────────────────────────
hide_channel = ["xyz"]

# Only session IDs that actually exist in DynamoDB
# VALID_SESSION_IDS = ["3", "4", "6", "7", "8", "9", "12", "13", "14", "15", "17", "18"]

SEARCH_SESSION_IDS = ["3", "4", "6", "7", "8", "9", "12", "13", "14", "15", "17", "18"]

USER_SESSION_IDS = ["9", "12", "13", "14", "15", "17", "18"]

# How many messages to pull from Telegram before keyword filtering. Telethon
# pages in batches of up to 100, so this is still ONE messages.search request
# on one session - same Telegram cost and same session checkout as limit=5.
SCAN_LIMIT = int(os.environ.get("SCAN_LIMIT", "100"))

# Messages returned per channel. The base 5 is what every search returned
# before keywords existed. More include terms means a wider OR, so a fixed 5
# under-represents a channel matching several of them - but this is a display
# cap, not a scan cap, so raising it costs nothing against Telegram.
#
# It cannot rescue an empty channel: a cap is a ceiling, not a floor. A channel
# with no matching message still returns none, which is why the response also
# carries scanned/matched counts so the caller can say "0 of 100 scanned"
# rather than rendering the same blank as a failed request.
# Telegram searches per channel: the base term plus include keywords.
# Each one is a separate request, so this is the real cost knob.
MAX_TERM_SEARCHES = int(os.environ.get("MAX_TERM_SEARCHES", "4"))
# "demote" ranks excluded messages last; "remove" drops them entirely.
EXCLUDE_MODE = os.environ.get("EXCLUDE_MODE", "demote")
BASE_LIMIT = int(os.environ.get("BASE_LIMIT", "5"))
MAX_LIMIT = int(os.environ.get("MAX_LIMIT", "20"))


def _effective_limit(include_keywords):
    """Messages returned per channel.

    Keyword-free searches keep the historic 5. A filtered search has three tiers
    to show, so 5 slots would all be spent on the top tiers and the query-only
    evidence would never reach the screen. One extra allowance per keyword.
    """
    if not include_keywords:
        return BASE_LIMIT
    return min(BASE_LIMIT * (1 + len(include_keywords)), MAX_LIMIT)


def _clean(keywords):
    return [k.strip() for k in (keywords or []) if k and k.strip()]


def _has_any(text, keywords):
    low = text.lower()
    return any(k.lower() in low for k in keywords)


def _search_terms(base, include_keywords):
    """One Telegram search per term: the base query plus each include keyword.

    The searches are a RECALL device, not the filter. Telegram's q= restricts
    what gets scanned, so searching only the base term means scanning 100
    messages containing "apk" and hoping one also says "SBI". Searching every
    term and applying the AND over the merged candidates covers more ground for
    the same predicate.

    Capped because the presets carry 19 include keywords and each term is one
    request per channel.
    """
    terms = [t for t in dict.fromkeys([base] + list(include_keywords)) if t]
    return terms[:MAX_TERM_SEARCHES] if include_keywords else terms[:1]


def _rank(text, base, include_keywords, exclude_keywords=None):
    """Priority for one message; LOWER sorts first. dork6 only.

    Normal searches (dorks 1-5) send no keywords and never reach this - their
    messages keep Telegram's order and the AI ranker decides, as before.

    The weights are spaced so each factor dominates the next:

        missing * 100   how many requested terms are absent   (biggest lever)
        excluded * 50   an excluded term is present
        no_query * 25   the search query itself is missing
        idx             prefers the earlier keyword field

    which produces, for query + kw1 + kw2:

          3   Q + kw1 + kw2, clean          <- 1st
         53   Q + kw1 + kw2, excluded word  <- 2nd
        101   Q + kw1                       <- 3rd
        102   Q + kw2
        128   kw1 + kw2  (no query)
        200   Q only
        226   kw1 only

    Excludes demote instead of delete, which is what makes group 2 reachable at
    all. They sort below everything clean, so an excluded message only surfaces
    when there is nothing better to fill the per-channel slots. Set
    EXCLUDE_MODE=remove to go back to dropping them outright.
    """
    low = text.lower()
    terms = ([base] if base else []) + list(include_keywords)
    hit = [i for i, t in enumerate(terms) if t and t.lower() in low]
    missing = len(terms) - len(hit)
    excluded = 1 if (exclude_keywords and _has_any(text, exclude_keywords)) else 0
    no_query = 0 if (base and 0 in hit) else 1
    return missing * 100 + excluded * 50 + no_query * 25 + min(sum(hit), 24)
def get_update_current_index(session_type="search"):
    """Pick a session at random from the pool.

    Was a round-robin cursor in os.environ, but that lives only inside one warm
    container: every cold start reset it to index 0, and the frontend fans out
    10 channel lookups at once. Measured over 60 invocations the load was ~7:1
    skewed onto session "3" while 17 and 18 were nearly idle, concentrating
    FloodWait risk on a few accounts.

    ponytail: random.choice needs no shared state and cannot reset. Uniform in
    expectation; a DynamoDB atomic counter would be exactly uniform but costs a
    write per invocation to fix a skew that random already removes.
    """
    session_pool = USER_SESSION_IDS if session_type == "user" else SEARCH_SESSION_IDS
    session_id = random.choice(session_pool)
    print(f"[{session_type}] Using session: {session_id}")
    return session_id


# A revoked session raises on connect (Telethon's context manager calls start(),
# which tries to prompt for a phone number and dies with "EOF when reading a
# line"; a session Telegram killed for concurrent IPs says so outright). One
# dead account in the pool used to be masked by the os.environ skew - now that
# rotation is uniform it would fail ~1 request in N, so try the next session
# instead of failing the caller.
SESSION_ATTEMPTS = int(os.environ.get("SESSION_ATTEMPTS", "3"))


def _session_candidates(session_type="search"):
    """Distinct sessions to try, in random order. random.sample never repeats,
    so a retry can't land on the session that just failed."""
    pool = USER_SESSION_IDS if session_type == "user" else SEARCH_SESSION_IDS
    return random.sample(pool, min(SESSION_ATTEMPTS, len(pool)))


def _open_session(session_id):
    """(session, api_id, api_hash) from DynamoDB, or None if absent."""
    db_data = fetch_session_from_dynamodb(session_id)
    if not db_data:
        print(f"No session found in DynamoDB for {session_id}.")
        return None
    return (StringSession(db_data['Session_Data']),
            db_data["API_ID"], db_data["API_HASH"])


# ── Lambda handler ────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    print(event)
    body = event.get("body")
    if not body:
        return {
            'statusCode': 400,
            'body': json.dumps({"error": "request body is required"})
        }

    body_dict = json.loads(body)
    search_query = body_dict.get("search_query", None)
    channel_name = body_dict.get("channel_name", None)
    user_id = body_dict.get("user_id", None)

    print("search_query", search_query)
    print("channel_name", channel_name)
    print("user_id", user_id)

    if not channel_name:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "channel_name is required"})
        }

    # Optional. Absent (every non-advanced search, i.e. dorks 1-5) means the
    # filter never runs and behaviour is unchanged.
    include_keywords = body_dict.get("include_keywords") or []
    exclude_keywords = body_dict.get("exclude_keywords") or []
    if not isinstance(include_keywords, list):
        include_keywords = [include_keywords]
    if not isinstance(exclude_keywords, list):
        exclude_keywords = [exclude_keywords]

    if user_id:
        result = retrieve_user_messages(channel_name, user_id)
    elif search_query:
        result = retrieve_telegram_messages(search_query, channel_name,
                                            include_keywords=include_keywords,
                                            exclude_keywords=exclude_keywords)
    else:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Either search_query or user_id is required"})
        }

    return result


# ── DynamoDB helpers ──────────────────────────────────────────────────────────
def fetch_session_from_dynamodb(session_id):
    try:
        response = table.get_item(Key={'SessionId': session_id})
        if 'Item' in response:
            return response['Item']
        print(f"Session {session_id} not found in DynamoDB.")
        return None
    except ClientError as e:
        print(f"Failed to load session from DynamoDB: {e}")
        return None


def save_session_to_dynamodb(session_str, session_id="default"):
    try:
        table.put_item(Item={
            'SessionId': session_id,
            'SessionData': session_str
        })
        print("Session saved to DynamoDB.")
    except ClientError as e:
        print(f"Failed to save session to DynamoDB: {e}")


# ── Resolve channel and auto-join if public ───────────────────────────────────
def resolve_channel(client, channel_name):
    """
    Resolves the channel entity and attempts to join it.
    For public groups: joining allows full message history access.
    Returns the channel entity.
    """
    try:
        channel = client.get_entity(channel_name)
        print(f"Resolved channel: {channel_name} (type: {type(channel).__name__})")
    except ValueError as e:
        print(f"Cannot resolve channel '{channel_name}': {e}")
        return None

    # Try to join (works for public channels/groups; no-op if already member)
    try:
        client(JoinChannelRequest(channel))
        print(f"Joined or already member of {channel_name}")
    except ChannelPrivateError:
        print(f"Channel {channel_name} is private — cannot join without invite link")
    except FloodWaitError as e:
        print(f"Rate limited on join, wait {e.seconds}s")
    except Exception as e:
        print(f"Join attempt for {channel_name}: {type(e).__name__}: {e} (probably already member)")

    return channel


# ── Fetch messages by keyword search ─────────────────────────────────────────
def fetch_messages_from_channel(client, channel_name, keyword, limit=7,
                                include_keywords=None, exclude_keywords=None):
    # Blank fields arrive as [""] / ["  "] from the advance panel. A list with
    # nothing usable in it means no filter at all.
    include_keywords = _clean(include_keywords)
    exclude_keywords = _clean(exclude_keywords)
    filtering = bool(include_keywords or exclude_keywords)
    scan = SCAN_LIMIT if filtering else limit
    if filtering:
        limit = _effective_limit(include_keywords)
    display_name = " " if channel_name in hide_channel else channel_name

    by_id, scanned = {}, 0
    for term in _search_terms(keyword, include_keywords):
        try:
            for message in client.iter_messages(channel_name, limit=scan, search=term):
                scanned += 1
                if not message.text:
                    continue
                # Excludes demote rather than delete, so the "all terms but
                # carries an excluded word" group stays reachable. EXCLUDE_MODE
                # =remove restores the old hard filter.
                if (EXCLUDE_MODE == "remove" and exclude_keywords
                        and _has_any(message.text, exclude_keywords)):
                    continue
                by_id[message.id] = {
                    "channel_name": display_name,
                    "message_id": message.id,
                    "text": message.text,
                    "date": message.date.isoformat(),
                    "sender_id": message.sender_id,
                }
                if not filtering and len(by_id) >= limit:
                    break
        except (ChannelInvalidError, ChannelPrivateError) as e:
            print(f"Channel error on term {term!r}: {str(e)}")
        except FloodWaitError as e:
            print(f"Rate limited by Telegram, wait for {e.seconds} seconds.")
            break
        except Exception as e:
            print(f"Failed to fetch messages for term {term!r}: {str(e)}")

    found = list(by_id.values())
    n_terms = (1 if keyword else 0) + len(include_keywords)
    if filtering:
        for m in found:
            # Emitted to the client: it merges every channel and needs one key
            # to order the whole set by, ahead of the AI score.
            m["priority"] = _rank(m["text"], keyword, include_keywords,
                                  exclude_keywords)
        # Two stable passes: newest first, then by priority, so date breaks
        # ties inside a priority group.
        found.sort(key=lambda m: m["date"], reverse=True)
        found.sort(key=lambda m: m["priority"])
        # missing*100 dominates the priority, so band 0 means every term matched.
        counts = {}
        for m in found:
            n_hit = n_terms - (m["priority"] // 100)
            counts[max(n_hit, 0)] = counts.get(max(n_hit, 0), 0) + 1
        all_terms = sum(1 for m in found if m["priority"] < 100)
        clean_all_terms = sum(1 for m in found if m["priority"] < 50)
        # query AND at least one keyword - read off the text, because a
        # 3-term search puts "query + kw1" in band 1 alongside "kw1 + kw2".
        both_terms = sum(
            1 for m in found
            if keyword and keyword.lower() in m["text"].lower()
            and include_keywords and _has_any(m["text"], include_keywords))
        excluded = sum(1 for m in found
                       if exclude_keywords and _has_any(m["text"], exclude_keywords))
    else:
        counts, both_terms, all_terms, clean_all_terms, excluded = {}, 0, 0, 0, 0
    messages_info = found[:limit]

    return messages_info, {"scanned": scanned, "matched": both_terms,
                           "both_terms": both_terms, "all_terms": all_terms,
                           "all_terms_clean": clean_all_terms,
                           "demoted_by_exclude": excluded,
                           "by_terms_matched": counts, "terms": n_terms,
                           "returned": len(messages_info), "filtered": filtering}


def retrieve_telegram_messages(search_query, channel_name, limit=5,
                               include_keywords=None, exclude_keywords=None):
    last_error = None
    for session_id in _session_candidates("search"):
        print(f"[search] Using session: {session_id}")
        opened = _open_session(session_id)
        if not opened:
            last_error = f"no session {session_id} in DynamoDB"
            continue
        session, api_id, api_hash = opened
        try:
            with TelegramClient(session, api_id, api_hash, use_ipv6=False) as client:
                messages_info, match_stats = fetch_messages_from_channel(
                    client, channel_name, search_query, limit,
                    include_keywords=include_keywords, exclude_keywords=exclude_keywords)
                print(messages_info, match_stats)

            match_stats["session"] = session_id
            return {
                'statusCode': 200,
                'body': json.dumps({"messages_info": messages_info,
                                    "match_stats": match_stats}),
                'headers': {
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST'
                },
            }
        except Exception as e:
            last_error = f"session {session_id}: {type(e).__name__}: {e}"
            print(f"Error: {last_error}")

    print(f"All {SESSION_ATTEMPTS} session attempts failed.")
    return {"statusCode": 500, "error": str(last_error)}


# ── Fetch messages from a specific user in a channel ─────────────────────────
def fetch_messages_from_user(client, channel_name, user_id, limit=5, max_scan=1000):
    messages_info = []
    numeric_id = int(user_id)
    new_channel_name = " " if channel_name in hide_channel else channel_name

    # 1. Resolve and join channel
    channel = resolve_channel(client, channel_name)
    if not channel:
        print(f"Could not resolve channel: {channel_name}")
        return messages_info

    # 2. Reliable client-side filtering only
    print(f"Scanning messages for sender_id={numeric_id}")

    scanned = 0

    try:
        for message in client.iter_messages(channel, limit=max_scan):

            scanned += 1

            # Exact sender match
            if message.sender_id == numeric_id and message.text:

                messages_info.append({
                    "channel_name": new_channel_name,
                    "message_id": message.id,
                    "text": message.text,
                    "date": message.date.isoformat(),
                    "sender_id": message.sender_id,
                    "from_user": user_id,
                })

                if len(messages_info) >= limit:
                    break

        print(
            f"Found {len(messages_info)} exact messages "
            f"after scanning {scanned} messages"
        )

    except Exception as e:
        print(f"Client-side scan failed: {type(e).__name__}: {e}")

    # 4. Client-side fallback scan
    if not messages_info:
        print(f"Falling back to client-side scan of last {max_scan} messages")
        scanned = 0
        try:
            for message in client.iter_messages(channel, limit=max_scan):
                if scanned >= max_scan:
                    break
                if message.sender_id == numeric_id and message.text:
                    messages_info.append({
                        "channel_name": new_channel_name,
                        "message_id": message.id,
                        "text": message.text,
                        "date": message.date.isoformat(),
                        "sender_id": message.sender_id,
                        "from_user": user_id,
                    })
                    if len(messages_info) >= limit:
                        break
                scanned += 1
            print(f"Client-side scan found {len(messages_info)} messages for user {numeric_id}")
        except Exception as e:
            print(f"Client-side scan failed: {type(e).__name__}: {e}")

    return messages_info


def retrieve_user_messages(channel_name, user_id, limit=5):
    last_error = None
    for session_id in _session_candidates("user"):
        print(f"[user] Using session: {session_id}")
        opened = _open_session(session_id)
        if not opened:
            last_error = f"no session {session_id} in DynamoDB"
            continue
        session, api_id, api_hash = opened
        try:
            with TelegramClient(session, api_id, api_hash, use_ipv6=False) as client:
                messages_info = fetch_messages_from_user(client, channel_name, user_id, limit)
                print(messages_info)

            return {
                'statusCode': 200,
                'body': json.dumps({"messages_info": messages_info}),
                'headers': {
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST'
                },
            }
        except Exception as e:
            last_error = f"session {session_id}: {type(e).__name__}: {e}"
            print(f"Error: {last_error}")

    print(f"All {SESSION_ATTEMPTS} session attempts failed.")
    return {"statusCode": 500, "body": json.dumps({"error": str(last_error)})}
