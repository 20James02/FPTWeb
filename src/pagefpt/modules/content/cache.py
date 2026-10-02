import hashlib
import json

from starlette.responses import Response


def public_json(request, data):
    body = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    etag = '"' + hashlib.sha256(body).hexdigest() + '"'
    headers = {"ETag": etag, "Cache-Control": "public,max-age=0,s-maxage=30,must-revalidate"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)
