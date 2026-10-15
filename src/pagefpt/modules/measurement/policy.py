from pagefpt.api.authorization import check, current_actor
from pagefpt.core.errors import DomainError
from pagefpt.modules.identity.sessions import same_origin

GLOBAL = "00000000-0000-0000-0000-000000000000"


async def authorize(request, permission="measurement.read", *, mfa=False):
    actor = await current_actor(request)
    check(actor, permission, GLOBAL, mfa=mfa)
    # The first release manages website-wide destinations, not per-branch credentials.
    if not any(
        m["branch_id"] == GLOBAL and (permission in m["permissions"] or "*" in m["permissions"])
        for m in actor.memberships
    ):
        raise DomainError("PERMISSION_DENIED", 403)
    if request.method not in {"GET", "HEAD"}:
        same_origin(request)
    return actor
