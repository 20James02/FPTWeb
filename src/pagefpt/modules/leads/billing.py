"""Agreed package, dated installments and employee-only due reminders."""

import json
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import Field, field_validator, model_validator

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.modules.catalog.schemas import VersionCommand
from pagefpt.modules.pricing.schemas import Command

router = APIRouter(prefix="/api/v1/admin")


class DealSave(Command):
    expected_version: int = Field(ge=0, strict=True)
    plan_id: UUID
    billing_months: int = Field(strict=True)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("billing_months")
    @classmethod
    def supported_term(cls, value):
        if value not in {1, 6, 12}:
            raise ValueError("Choose 1, 6 or 12 months")
        return value


class PaymentCreate(VersionCommand):
    payment_id: UUID
    due_date: date
    amount_vnd: int = Field(ge=1, le=1_000_000_000, strict=True)
    notes: str = Field(default="", max_length=2000)

    @field_validator("due_date")
    @classmethod
    def valid_date(cls, value):
        if not 2020 <= value.year <= 2100:
            raise ValueError("Date outside supported calendar")
        return value


class PaymentUpdate(VersionCommand):
    status: Literal["pending", "cancelled"] = "pending"
    due_date: date | None = None
    amount_vnd: int | None = Field(default=None, ge=1, le=1_000_000_000, strict=True)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("due_date")
    @classmethod
    def valid_date(cls, value):
        if value is not None and not 2020 <= value.year <= 2100:
            raise ValueError("Date outside supported calendar")
        return value

    @model_validator(mode="after")
    def has_change(self):
        if self.status == "pending" and all(
            x is None for x in (self.due_date, self.amount_vnd, self.notes)
        ):
            raise ValueError("A change is required")
        return self


class PaymentCollect(VersionCommand):
    create_next: bool = Field(default=False, strict=True)


def protected_notes(request, actor, value):
    """A scoped SQL result may contain encrypted notes; never return ciphertext."""
    if value is None:
        return None
    value = dict(value)
    cipher = value.pop("notes_ciphertext", None)
    # SQL has already checked permission on this exact lead/branch. Check PII
    # permission for that same branch rather than an unrelated membership.
    branch = value.pop("scope_branch_id", None) or "00000000-0000-0000-0000-000000000000"
    visible = actor.aal == "aal2" and actor.permits("lead.pii", branch)
    value["notes"] = crypto(request).decrypt(cipher) if cipher and visible else None
    value["notes_hidden"] = bool(cipher and not visible)
    value.pop("command_hash", None)
    value.pop("collect_hash", None)
    return value


def encrypted_input(request, input, *, fingerprint=False):
    data = input.model_dump(mode="json", exclude_none=True)
    if fingerprint:
        data["command_hash"] = crypto(request).match(
            json.dumps(data, sort_keys=True, separators=(",", ":")), "payment-command"
        )
    if "notes" in data:
        data["notes_ciphertext"] = crypto(request).encrypt(data.pop("notes"))
    return data


@router.get("/leads/{id}/billing")
async def billing_read(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    data = await dispatch(request, "billing_read", actor=actor.user_id, id=str(id))
    return {"deal": protected_notes(request, actor, data["deal"])}


@router.put("/leads/{id}/billing")
async def billing_save(id: UUID, input: DealSave, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write", mfa=True)
    data = await dispatch(
        request,
        "billing_save",
        actor=actor.user_id,
        id=str(id),
        payload=encrypted_input(request, input),
    )
    return {"deal": protected_notes(request, actor, data["deal"])}


@router.get("/leads/{id}/payments")
async def payment_list(
    id: UUID, request: Request, limit: int = Query(30, ge=1, le=100), before: UUID | None = None
):
    actor = await current_actor(request)
    check(actor, "lead.read")
    data = await dispatch(
        request,
        "payment_list",
        actor=actor.user_id,
        id=str(id),
        limit=limit + 1,
        before=str(before) if before else None,
    )
    items = data["items"]
    more = len(items) > limit
    items = items[:limit]
    return {
        "items": [protected_notes(request, actor, x) for x in items],
        "next_before": items[-1]["id"] if more else None,
    }


@router.post("/leads/{id}/payments", status_code=201)
async def payment_create(id: UUID, input: PaymentCreate, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write", mfa=True)
    data = await dispatch(
        request,
        "payment_create",
        actor=actor.user_id,
        id=str(id),
        payload=encrypted_input(request, input, fingerprint=True),
    )
    return protected_notes(request, actor, data)


@router.patch("/payments/{id}")
async def payment_update(id: UUID, input: PaymentUpdate, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write", mfa=True)
    data = await dispatch(
        request,
        "payment_update",
        actor=actor.user_id,
        id=str(id),
        payload=encrypted_input(request, input),
    )
    return protected_notes(request, actor, data)


@router.post("/payments/{id}/collect")
async def payment_collect(id: UUID, input: PaymentCollect, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.write", mfa=True)
    data = await dispatch(
        request,
        "payment_collect",
        actor=actor.user_id,
        id=str(id),
        payload=encrypted_input(request, input, fingerprint=True),
    )
    return {key: protected_notes(request, actor, data[key]) for key in ("payment", "next_payment")}


@router.get("/notifications")
async def notifications(request: Request, limit: int = Query(30, ge=1, le=100)):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "payment_notifications", actor=actor.user_id, limit=limit)


@router.post("/notifications/{id}/read")
async def notice_read(id: UUID, request: Request):
    actor = await current_actor(request)
    check(actor, "lead.read")
    return await dispatch(request, "payment_notice_read", actor=actor.user_id, id=str(id))
