"""
AWS Lambda function to extract admins and members from a Telegram group.

Auto-joins the group if the session account is not already a member,
then extracts the requested data.

Environment variables required:
    TG_API_ID         - Telegram API ID (from https://my.telegram.org)
    TG_API_HASH       - Telegram API Hash
    TG_STRING_SESSION - Telethon StringSession (pre-authenticated)

Invoke with JSON body:
    {
        "action": "get_admins" | "get_members",
        "group": "@group_username or group link or numeric ID"
    }
"""

import asyncio
import json
import os
import re
from typing import Any, Optional

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl import types
from telethon.tl.functions.messages import (
    CheckChatInviteRequest,
    ImportChatInviteRequest,
)
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.errors import (
    FloodWaitError,
    ChannelPrivateError,
    UserAlreadyParticipantError,
    InviteHashExpiredError,
    InviteRequestSentError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
    ChatWriteForbiddenError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_target(raw: str) -> tuple[str, Any]:
    """Parse a username, numeric ID, t.me link, or invite hash."""
    raw = (raw or "").strip()
    if not raw:
        return "entity", raw

    m = re.match(
        r"(?:https?://)?(?:t\.me|telegram\.me|telegram\.dog)/(.+)$",
        raw, re.IGNORECASE,
    )
    if m:
        path = m.group(1).strip("/")
        inv = re.match(r"\+[\w-]+$", path) or re.match(
            r"joinchat/([\w-]+)$", path, re.IGNORECASE
        )
        if inv:
            return "invite", inv.group(1) if inv.lastindex else path.lstrip("+")
        cm = re.match(r"c/(\d+)", path)
        if cm:
            return "peer_channel", int(cm.group(1))
        username = path.split("/")[0].split("?")[0]
        return "entity", username

    if raw.startswith("@"):
        return "entity", raw[1:]
    if re.fullmatch(r"-?\d+", raw):
        return "entity", int(raw)
    if re.fullmatch(r"\+[\w-]+", raw):
        return "invite", raw[1:]
    return "entity", raw


def _participant_role(user: Any) -> tuple[str, Optional[str]]:
    """Return (role, custom_rank) for a participant."""
    p = getattr(user, "participant", None)
    if isinstance(p, (types.ChannelParticipantCreator, types.ChatParticipantCreator)):
        return "creator", getattr(p, "rank", None)
    if isinstance(p, (types.ChannelParticipantAdmin, types.ChatParticipantAdmin)):
        return "admin", getattr(p, "rank", None)
    return "member", None


def _status_label(status: Any) -> Optional[str]:
    """Human-readable last-seen status."""
    if status is None:
        return None
    if isinstance(status, types.UserStatusOffline) and getattr(status, "was_online", None):
        return f"offline (last seen {status.was_online.date().isoformat()})"
    return type(status).__name__.replace("UserStatus", "").lower() or None


# ---------------------------------------------------------------------------
# Join / Leave helpers
# ---------------------------------------------------------------------------

async def _try_get_entity(client: TelegramClient, kind: str, value: Any) -> Optional[Any]:
    """
    Attempt to resolve the entity without joining.
    Returns the entity if the user is already a member, otherwise None.
    """
    try:
        if kind == "peer_channel":
            entity = await client.get_entity(types.PeerChannel(value))
        elif kind == "invite":
            # CheckChatInviteRequest does NOT join — it only peeks.
            result = await client(CheckChatInviteRequest(value))
            # ChatInviteAlready → user is already a member, .chat is the entity
            if hasattr(result, "chat") and result.chat is not None:
                return result.chat
            # ChatInvite → user is NOT a member
            return None
        else:
            entity = await client.get_entity(value)

        # Verify we can actually access participants (i.e. we are a member)
        # For channels/megagroups, getting the entity succeeds even for public
        # ones we haven't joined, but iter_participants will fail.
        if isinstance(entity, (types.Channel, types.Chat)):
            return entity
        return entity

    except (ChannelPrivateError, ValueError, UsernameNotOccupiedError):
        return None


async def _join_group(client: TelegramClient, kind: str, value: Any) -> Any:
    """
    Join a group/channel and return the entity.
    Raises ValueError with a clear message if joining is not possible.
    """
    try:
        if kind == "invite":
            # ImportChatInviteRequest joins via invite hash
            updates = await client(ImportChatInviteRequest(value))
            # The joined chat is in updates.chats
            chats = getattr(updates, "chats", [])
            if chats:
                return chats[0]
            raise ValueError("Joined via invite but could not resolve the group entity.")

        else:
            # For usernames / IDs — use JoinChannelRequest
            # First resolve to get the entity reference
            if isinstance(value, int):
                entity = await client.get_entity(types.PeerChannel(value))
            else:
                entity = await client.get_entity(value)
            await client(JoinChannelRequest(entity))
            # Re-fetch to get updated participant info
            return await client.get_entity(entity)

    except UserAlreadyParticipantError:
        # Already in the group — just resolve and return
        if kind == "invite":
            result = await client(CheckChatInviteRequest(value))
            return result.chat
        if isinstance(value, int):
            return await client.get_entity(types.PeerChannel(value))
        return await client.get_entity(value)

    except InviteHashExpiredError:
        raise ValueError("Invite link has expired or been revoked.")

    except InviteRequestSentError:
        raise ValueError(
            "This group requires admin approval to join. "
            "A join request has been sent — cannot extract members yet."
        )

    except ChannelPrivateError:
        raise ValueError("Group is private and cannot be joined with the given input.")

    except FloodWaitError as e:
        raise ValueError(f"Telegram rate limit — wait {getattr(e, 'seconds', '?')} seconds before retrying.")





# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

async def _resolve_and_join(
    client: TelegramClient, raw: str
) -> tuple[Any, bool]:
    """
    Resolve a group identifier to a Telethon entity.
    Auto-joins if the session user is not already a member.

    Returns:
        (entity, did_join) — did_join is True if we had to join the group.
    """
    kind, value = _parse_target(raw)
    if not value and value != 0:
        raise ValueError("Empty group identifier.")

    # Step 1: try to access without joining
    entity = await _try_get_entity(client, kind, value)
    if entity is not None:
        # Already a member — verify we can list participants
        try:
            count = 0
            async for _ in client.iter_participants(entity, limit=1):
                count += 1
                break
            return entity, False
        except (ChannelPrivateError, ChatWriteForbiddenError):
            # We can see the entity but can't list members → need to join
            pass
        except Exception:
            # For small basic groups, iter_participants may work differently
            return entity, False

    # Step 2: join the group
    print(f"Not a member of '{raw}' — attempting to join...")
    entity = await _join_group(client, kind, value)
    # Brief pause to let Telegram propagate the membership
    await asyncio.sleep(1)
    return entity, True


async def _enumerate_participants(client: TelegramClient, entity: Any) -> list[dict]:
    """Fetch all visible participants of a group/channel."""
    members: list[dict] = []
    try:
        async for user in client.iter_participants(entity, limit=50_000):
            role, rank = _participant_role(user)
            members.append({
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "name": " ".join(p for p in (user.first_name, user.last_name) if p) or None,
                "phone": getattr(user, "phone", None),
                "is_bot": bool(getattr(user, "bot", False)),
                "is_premium": bool(getattr(user, "premium", False)),
                "status": _status_label(getattr(user, "status", None)),
                "role": role,
                "rank": rank,
            })
    except FloodWaitError as e:
        print(f"FloodWait: {getattr(e, 'seconds', '?')}s — returning {len(members)} fetched so far.")
    except ChannelPrivateError:
        raise ValueError("Cannot access this group's members (private or no permission).")

    rank_order = {"creator": 0, "admin": 1, "member": 2}
    members.sort(key=lambda m: (rank_order.get(m["role"], 3), (m["username"] or "~").lower()))
    return members


async def get_admins(client: TelegramClient, group: str) -> dict:
    """Return only admins (creator + admins) for the given group."""
    entity, did_join = await _resolve_and_join(client, group)
    all_members = await _enumerate_participants(client, entity)
    admins = [m for m in all_members if m["role"] in ("creator", "admin")]
    return {
        "group_id": getattr(entity, "id", None),
        "group_title": getattr(entity, "title", None),
        "auto_joined": did_join,
        "admin_count": len(admins),
        "admins": admins,
    }


async def get_members(client: TelegramClient, group: str) -> dict:
    """Return all visible members for the given group."""
    entity, did_join = await _resolve_and_join(client, group)
    all_members = await _enumerate_participants(client, entity)
    return {
        "group_id": getattr(entity, "id", None),
        "group_title": getattr(entity, "title", None),
        "auto_joined": did_join,
        "member_count": len(all_members),
        "members": all_members,
    }


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def _build_client() -> TelegramClient:
    api_id = int(os.environ["TG_API_ID"])
    api_hash = os.environ["TG_API_HASH"]
    session_str = os.environ["TG_STRING_SESSION"]
    return TelegramClient(StringSession(session_str), api_id, api_hash)


async def _handle(event: dict) -> dict:
    body = event
    if isinstance(event.get("body"), str):
        body = json.loads(event["body"])
    elif event.get("queryStringParameters"):
        body = event["queryStringParameters"]

    action = (body.get("action") or "").strip().lower()
    group = (body.get("group") or "").strip()

    if action not in ("get_admins", "get_members"):
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": "Invalid action. Use 'get_admins' or 'get_members'."
            }),
        }
    if not group:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "'group' parameter is required."}),
        }

    client = _build_client()
    async with client:
        if action == "get_admins":
            result = await get_admins(client, group)
        else:
            result = await get_members(client, group)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(result, default=str),
    }


def lambda_handler(event, context):
    """AWS Lambda entry point."""
    try:
        return asyncio.run(_handle(event))
    except (ValueError, UsernameInvalidError, UsernameNotOccupiedError) as exc:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": str(exc)}),
        }
    except Exception as exc:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(exc)}),
        }