import csv
import io
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from pydantic import Field, ValidationError

from pagefpt.api.authorization import check, current_actor
from pagefpt.api.dependencies import crypto, dispatch
from pagefpt.core.errors import DomainError
from pagefpt.modules.pricing.schemas import Command, PriceInput

router = APIRouter(prefix="/api/v1/admin/prices/imports")


class ImportInput(Command):
    csv: str = Field(max_length=256 * 1024)


class ApplyInput(ImportInput):
    approval_token: str = Field(max_length=8192)


def parse_prices(text: str):
    rows, errors = [], []
    reader = csv.DictReader(io.StringIO(text), strict=True)
    try:
        for index, row in enumerate(reader, start=2):
            if index > 101:
                errors.append({"row": index, "code": "MAX_100_ROWS"})
                break
            try:
                # Explicit CSV booleans only; Pydantic parses integer/datetime fields.
                data = {key: value for key, value in row.items() if value != ""}
                if None in data:
                    raise ValueError("Unexpected column")
                rows.append(PriceInput.model_validate(data).model_dump(mode="json"))
            except (ValidationError, ValueError):
                errors.append({"row": index, "code": "INVALID_PRICE_ROW"})
    except csv.Error:
        errors.append({"row": reader.line_num, "code": "INVALID_CSV"})
    if not rows and not errors:
        errors.append({"row": 1, "code": "EMPTY_IMPORT"})
    return rows, errors


@router.post("/preview")
async def preview(input: ImportInput, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write")
    rows, errors = parse_prices(input.csv)
    token = None
    if not errors:
        token = crypto(request).sign(
            {
                "purpose": "price_import",
                "actor": actor.user_id,
                "digest": crypto(request).match(json.dumps(rows, sort_keys=True), "import"),
                "exp": datetime.now(UTC).timestamp() + 900,
            }
        )
    return {"rows": rows, "errors": errors, "approval_token": token, "status": "draft_only"}


@router.post("/apply", status_code=201)
async def apply(input: ApplyInput, request: Request):
    actor = await current_actor(request)
    check(actor, "pricing.write", mfa=True)
    claims = crypto(request).verify(input.approval_token, "price_import", datetime.now(UTC))
    rows, errors = parse_prices(input.csv)
    if (
        errors
        or claims["actor"] != actor.user_id
        or claims["digest"] != crypto(request).match(json.dumps(rows, sort_keys=True), "import")
    ):
        raise DomainError("INVALID_IMPORT", 422)
    return await dispatch(request, "price_import", actor=actor.user_id, rows=rows)
