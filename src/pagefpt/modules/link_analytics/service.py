from datetime import UTC, datetime, timedelta
from uuid import UUID

from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError

BOT_MARKERS = (
    "bot",
    "crawler",
    "spider",
    "facebookexternalhit",
    "facebot",
    "twitterbot",
    "telegrambot",
    "whatsapp",
    "slackbot",
    "discordbot",
    "linkedinbot",
    "preview",
)


def preview_bot(request):
    agent = request.headers.get("user-agent", "")[:512].lower()
    return any(marker in agent for marker in BOT_MARKERS)


def sign_source(request, row, acquired_at=None):
    now = datetime.now(UTC)
    return crypto(request).sign(
        {
            "purpose": "link_source",
            "link_id": str(row["id"]),
            "version": int(row["version"]),
            "acquired_at": acquired_at or now.isoformat(),
            "exp": (now + timedelta(days=30)).timestamp(),
        }
    )


def source_claims(crypt, token, now):
    claims = crypt.verify(token, "link_source", now)
    UUID(claims["link_id"])
    version = claims["version"]
    acquired = datetime.fromisoformat(claims["acquired_at"])
    if (
        isinstance(version, bool)
        or not isinstance(version, int)
        or version < 1
        or acquired.tzinfo is None
        or not now - timedelta(days=30) <= acquired <= now + timedelta(seconds=5)
    ):
        raise DomainError("INVALID_LINK_SOURCE", 422)
    return {"link_id": claims["link_id"], "version": version, "acquired_at": acquired.isoformat()}


async def lead_source(request, input, crypt, now):
    token = getattr(input, "link_source_token", None)
    if not token:
        return None
    try:
        source = source_claims(crypt, token, now)
    except (DomainError, ValueError, KeyError, TypeError):
        return None
    visit_token = getattr(input, "link_visit_token", None)
    if visit_token:
        try:
            visit = crypt.verify(visit_token, "link_visit", now)
            if visit["link_id"] == source["link_id"]:
                source["visit_id"] = str(UUID(visit["id"]))
        except (DomainError, ValueError, KeyError, TypeError):
            pass  # A stale optional journey never erases trusted service context.
    return source


async def consent_session(request, token):
    claims = crypto(request).verify(token, "session", datetime.now(UTC))
    session_id = str(UUID(claims["id"]))
    permission = await dispatch(request, "session_read", id=session_id)
    if not permission.get("analytics"):
        raise DomainError("ANALYTICS_CONSENT_REQUIRED", 403)
    return session_id
