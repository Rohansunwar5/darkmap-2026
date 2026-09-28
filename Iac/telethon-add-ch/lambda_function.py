import boto3
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import ChannelInvalidError, ChannelPrivateError, FloodWaitError
from botocore.exceptions import ClientError
import json
import os
import random
# AWS region and DynamoDB table name
aws_region = 'us-east-1'
dynamodb = boto3.resource('dynamodb', region_name=aws_region)
table = dynamodb.Table('Additional-Channels')

hide_channel = [
"TheUnderground 4", 
"ARES PRIVATE CHANNEL",
"DataRecordsShop",
"DataBreachPremium", 
"SpamoArabo",
"Coa_Agency", 
"Anonymous0islamic", 
"investigationAnonYmousPS", 
"Team_r70YEMEN", 
"OceanLeak",
"databasee01", 
"leakdataprivate", 
"PDDcp", 
"baseleak", 
"LianSec",
"exposedghost", 
"insidehackerz", 
"afaghhosting ", 
"SMokerFiles", 
"RipperSec", 
"NetGhostSecurity",
"shieldteam1", 
"illsvcleaksupload", 
"HUBHEAD", 
"HUBHEAD | VIP SNATCH ROOM 2", 
"Goblin's Free Logs",
"OBSERVERINFO ",
"BreachedDiscussion1", 
"SiegedSecurity",
"Akatsuki", 
"LEAKS AGGREGATOR | УТЕЧКИ АГРЕГАТОР | БАЗЫ ДАННЫХ | СЛИВ |", 
"fakesec666",
"ridgedforums",
"KMPteam", 
"h4shur",
"IranDataLeak", 
"ByteMeCrew ",
"arvinclub1",
"TigerElectronicUnit",
"xxShad0dexx", 
"[ EVILX LEAKS CHAT]"
]

VALID_SESSION_IDS = ["3","4","6","7","8","9"]

# Telethon pages in batches of up to 100, so scanning this far is still ONE
# messages.search request on one session - same cost as the old limit=5.
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
def get_update_current_index():
    """Pick a session at random.

    Was a round-robin cursor in os.environ. That cursor lives only inside one
    warm container, so every cold start restarted the pool at index 0 and the
    load skewed hard onto the first few sessions (measured ~7:1 on the sibling
    function). It also read os.environ['CURRENT_INDEX'] with no default, so a
    container without that variable raised KeyError.

    ponytail: random.choice needs no shared state, cannot reset, and has no
    unset-variable failure mode.
    """
    session_id = random.choice(VALID_SESSION_IDS)
    print(session_id)
    return session_id


# A revoked session raises on connect. With uniform rotation one dead account
# would fail ~1 request in N, so try the next session instead.
SESSION_ATTEMPTS = int(os.environ.get("SESSION_ATTEMPTS", "3"))


def _session_candidates():
    """Distinct sessions in random order - a retry can't reuse the one that
    just failed."""
    return random.sample(VALID_SESSION_IDS, min(SESSION_ATTEMPTS, len(VALID_SESSION_IDS)))


def _open_session(session_id):
    db_data = fetch_session_from_dynamodb(session_id)
    if not db_data:
        print(f"No session found in DynamoDB for {session_id}.")
        return None
    return (StringSession(db_data['Session_Data']),
            db_data["API_ID"], db_data["API_HASH"])
    
# Lambda handler
def lambda_handler(event, context):
    print(event)
    body = event.get("body")
    if not body:
        return {
            'statusCode': 400,
            'body': json.dumps({"error": "search_query is required"}),
            'headers': {
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST'
            },
        }

        # Assuming the request body is form-encoded
    body_dict = json.loads(body)
    search_query = body_dict.get("search_query", None)
    channel_name = body_dict.get("channel_name", None)
    print("search_query",search_query)
    print("channel_name",channel_name)
    if not search_query or not channel_name:
        return {
            "statusCode": 400,
            "body": "Missing search_query or channel_name in request",
            'headers': {
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST'
            },
        }

    # Optional. Absent (every non-advanced search) means no filtering and
    # behaviour is unchanged.
    include_keywords = body_dict.get("include_keywords") or []
    exclude_keywords = body_dict.get("exclude_keywords") or []
    if not isinstance(include_keywords, list):
        include_keywords = [include_keywords]
    if not isinstance(exclude_keywords, list):
        exclude_keywords = [exclude_keywords]

    # Retrieve Telegram messages
    result = retrieve_telegram_messages(search_query, channel_name,
                                        include_keywords=include_keywords,
                                        exclude_keywords=exclude_keywords)
    return result

# Fetch session from DynamoDB
def fetch_session_from_dynamodb(session_id):
    try:
        response = table.get_item(Key={'SessionId': session_id})
        print(response)
        if 'Item' in response:
            return response['Item']
        else:
            print("Session not found in DynamoDB, starting a new session.")
            session_id = int(session_id) + 1
            response = table.get_item(Key={'SessionId': str(session_id)})
            print(response)
            if 'Item' in response:
                return response['Item']
            else:
                return None
    except ClientError as e:
        print(f"Failed to load session from DynamoDB: {e}")
        return None

# Save session to DynamoDB
def save_session_to_dynamodb(session_str, session_id="default"):
    try:
        table.put_item(Item={
            'SessionId': session_id,
            'SessionData': session_str
        })
        print("Session saved to DynamoDB.")
    except ClientError as e:
        print(f"Failed to save session to DynamoDB: {e}")

# Fetch messages from the channel synchronously
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

# Main function to retrieve messages
def retrieve_telegram_messages(search_query, channel_name, limit=5,
                               include_keywords=None, exclude_keywords=None):
    last_error = None
    for session_id in _session_candidates():
        print(f"Using session: {session_id}")
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
    return {"statusCode": 500, "body": json.dumps({"error": str(last_error)})}
