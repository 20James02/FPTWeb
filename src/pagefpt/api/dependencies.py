from pagefpt.core.crypto import Crypto


def crypto(request):
    s = request.app.state.settings
    return Crypto(
        s.encryption_key.get_secret_value(),
        s.matching_key.get_secret_value(),
        s.token_key.get_secret_value(),
        key_version=s.encryption_key_version,
        previous_keys={k: v.get_secret_value() for k, v in s.encryption_previous_keys.items()},
    )


async def dispatch(request, op, **command):
    return await request.app.state.db.rpc("dispatch", {"command": {"op": op, **command}})
