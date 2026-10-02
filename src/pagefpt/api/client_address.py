import ipaddress


def trusted_client_ip(request) -> str | None:
    """Vercel overwrites this header; do not enable for arbitrary direct upstreams."""
    if not request.app.state.settings.trusted_vercel_proxy:
        return None
    candidate = request.headers.get("x-vercel-forwarded-for", "").split(",")[0].strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None
