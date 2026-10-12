"""Assigned customer profile editing; phone is immutable and PII stays encrypted."""

import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import Field, model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.catalog.accessories import selection
from pagefpt.modules.catalog.geography import location_id
from pagefpt.modules.catalog.schemas import VersionCommand

router = APIRouter(prefix="/api/v1/admin")


class ProfileInput(VersionCommand):
    name: str = Field(default="", max_length=150)
    installation_address: str = Field(min_length=1, max_length=500)
    province_code: int = Field(ge=1, le=999999)
    ward_code: int = Field(ge=1, le=999999)
    plan_id: UUID | None = None
    accessory_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def valid_selection(self):
        self.name = self.name.strip()
        self.installation_address = self.installation_address.strip()
        if not self.installation_address or len(set(self.accessory_ids)) != len(self.accessory_ids):
            raise ValueError("Địa chỉ không được trống; phụ kiện không được trùng")
        if self.accessory_ids and not self.plan_id:
            raise ValueError("Chọn gói trước khi chọn phụ kiện")
        return self


async def profile_record(id, request):
    actor = await current_actor(request)
    check(actor, "lead.write")
    check(actor, "lead.pii", mfa=True)
    result = await dispatch(request, "lead_profile_read", actor=actor.user_id, id=str(id))
    return actor, result


@router.get("/address-options")
async def address_options(
    request: Request, province_code: int | None = Query(None, ge=1, le=999999)
):
    actor = await current_actor(request)
    check(actor, "lead.write")
    source = await request.app.state.geography.load()
    provinces = source["data"]
    if province_code is None:
        items = [{"code": p["code"], "name": p["name"]} for p in provinces]
    else:
        province = next((p for p in provinces if p["code"] == province_code), None)
        if not province:
            raise DomainError("INVALID_PROVINCE_CODE", 422)
        items = province["wards"]
    return {
        "items": items,
        "source": {k: source[k] for k in ("mode", "fetched_at", "warning", "provider")},
    }


@router.get("/leads/{id}/profile")
async def read_profile(id: UUID, request: Request):
    _, result = await profile_record(id, request)
    return {
        "lead": result["lead"],
        "pii": json.loads(crypto(request).decrypt(result["pii_ciphertext"])),
    }


@router.put("/leads/{id}/profile")
async def update_profile(id: UUID, input: ProfileInput, request: Request):
    actor, result = await profile_record(id, request)
    # Read permission and assignment precede external lookup and private decryption.
    source = await request.app.state.geography.load()
    province = next((p for p in source["data"] if p["code"] == input.province_code), None)
    ward = (
        next((w for w in province["wards"] if w["code"] == input.ward_code), None)
        if province
        else None
    )
    if not province or not ward:
        raise DomainError("INVALID_ADDRESS", 422)
    if input.plan_id:
        await dispatch(request, "public_resource", kind="plan", id=str(input.plan_id))
    devices = await selection(request, input.plan_id, input.accessory_ids)
    pii = json.loads(crypto(request).decrypt(result["pii_ciphertext"]))
    pii.update(name=input.name, installation_address=input.installation_address)
    return await dispatch(
        request,
        "lead_profile_update",
        actor=actor.user_id,
        id=str(id),
        expected_version=input.expected_version,
        pii_ciphertext=crypto(request).encrypt(json.dumps(pii, ensure_ascii=False)),
        plan_id=str(input.plan_id) if input.plan_id else None,
        accessory_ids=sorted(map(str, input.accessory_ids)),
        accessory_snapshot=devices,
        region_candidate=location_id("ward", input.ward_code),
        province_candidate=location_id("province", input.province_code),
        address_confirmation={
            "province_code": province["code"],
            "province_name": province["name"],
            "ward_code": ward["code"],
            "ward_name": ward["name"],
            "confirmed_by": actor.user_id,
            "confirmed_at": datetime.now(UTC).isoformat(),
            "source_date": source["fetched_at"],
        },
    )
