import pytest


@pytest.mark.asyncio
async def test_schema_permissions_and_health(gateway):
    assert await gateway.rpc("health", {}) == {"ready": True}


@pytest.mark.asyncio
async def test_anonymous_admin_denied(client):
    assert (await client.get("/api/v1/admin/me")).status_code == 401


@pytest.mark.asyncio
async def test_disabled_member_not_authorized(gateway):
    from pagefpt.core.errors import DomainError
    from pagefpt.modules.identity.service import IdentityService

    with pytest.raises(DomainError) as exc:
        await IdentityService(gateway).actor_for_subject(
            "00000000-0000-0000-0000-000000000001", "aal2"
        )
    assert exc.value.status == 403
