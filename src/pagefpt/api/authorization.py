from fastapi import Request

from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.service import Actor, IdentityService


async def current_actor(request: Request) -> Actor:
    header = request.headers.get("authorization", "")
    if header:
        if not header.startswith("Bearer ") or len(header) > 8192:
            raise DomainError("UNAUTHENTICATED", 401)
        token = header[7:]
    else:
        from pagefpt.modules.identity.sessions import session_token

        token = await session_token(request)
    claims = await request.app.state.verifier.verify(token)
    return await IdentityService(request.app.state.db).actor_for_subject(
        claims["sub"], claims.get("aal", "aal1")
    )


def check(actor: Actor, permission: str, branch_id: str | None = None, mfa=False):
    if not actor.permits(permission, branch_id) or (mfa and actor.aal != "aal2"):
        raise DomainError("PERMISSION_DENIED", 403)
