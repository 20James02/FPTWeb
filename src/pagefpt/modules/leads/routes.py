from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from pagefpt.api.dependencies import crypto
from pagefpt.modules.leads.schemas import LeadRequest
from pagefpt.modules.leads.service import submit_lead

router = APIRouter(prefix="/api/v1")


@router.post("/leads", status_code=201)
async def create_lead(
    input: LeadRequest,
    request: Request,
    idempotency_key: str = Header(default="", alias="Idempotency-Key"),
):
    result = await submit_lead(request, input, idempotency_key, crypto(request))
    replay = result.pop("replayed", False)
    return JSONResponse(result, status_code=200 if replay else 201)
