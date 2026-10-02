from fastapi import APIRouter, Request

from pagefpt.api.authorization import check, current_actor
from pagefpt.modules.identity.schemas import MembershipInput

router = APIRouter(prefix="/api/v1/admin")


@router.get("/me")
async def me(request: Request):
    actor = await current_actor(request)
    return {"id": actor.user_id, "aal": actor.aal, "memberships": actor.memberships}


@router.get("/memberships")
async def memberships(request: Request):
    from pagefpt.api.dependencies import dispatch

    actor = await current_actor(request)
    check(actor, "identity.manage", mfa=True)
    return await dispatch(request, "membership_list", actor=actor.user_id)


@router.put("/memberships")
async def membership_save(input: MembershipInput, request: Request):
    from pagefpt.api.dependencies import dispatch

    actor = await current_actor(request)
    check(actor, "identity.manage", str(input.branch_id), mfa=True)
    return await dispatch(
        request, "membership_save", actor=actor.user_id, payload=input.model_dump(mode="json")
    )
