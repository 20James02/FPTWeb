import ipaddress
from datetime import UTC, datetime

from pagefpt.api.client_address import trusted_client_ip
from pagefpt.core.crypto import normalize_phone


def mask_target_value(target_type: str, value: str) -> str:
    if target_type == "phone":
        return "***" + value[-4:] if len(value) >= 4 else "***"
    if target_type in {"ip", "subnet"}:
        try:
            ip = ipaddress.ip_address(value.split("/")[0].strip())
            if ip.version == 4:
                parts = str(ip).split(".")
                return f"{parts[0]}.{parts[1]}.***.***"
            parts = str(ip).split(":")
            return f"{parts[0]}:{parts[1]}:****:****"
        except ValueError:
            return "***"
    if target_type == "session":
        return value[:8] + "..." if len(value) > 8 else "***"
    return "***"


async def check_abuse_match(request, phone: str | None, session_id: str | None, crypt) -> dict:
    raw_ip = trusted_client_ip(request)
    ip_hash = crypt.match(raw_ip, "abuse-ip") if raw_ip else ""
    session_hash = crypt.match(session_id, "abuse-session") if session_id else ""
    phone_hash = crypt.match(phone, "abuse-phone") if phone else ""

    if not any((ip_hash, session_hash, phone_hash)):
        return {"matched": False}

    try:
        return await request.app.state.db.rpc(
            "dispatch",
            {
                "command": {
                    "op": "abuse_check",
                    "ip_hash": ip_hash,
                    "session_hash": session_hash,
                    "phone_hash": phone_hash,
                }
            },
        )
    except Exception:
        # Trong giai đoạn thử nghiệm hoặc khi DB chưa hoàn tất migration,
        # lỗi RPC tuyệt đối không được phép làm gián đoạn hoặc chặn người dùng!
        return {"matched": False}


async def create_abuse_rule(
    db, crypt, actor_id: str, target_type: str, target_value: str, action: str, reason: str, duration_hours: int
) -> dict:
    clean_val = target_value.strip()
    if target_type == "phone":
        clean_val = normalize_phone(clean_val)
    elif target_type in {"ip", "subnet"}:
        try:
            clean_val = str(ipaddress.ip_address(clean_val))
        except ValueError:
            pass

    target_hash = crypt.match(clean_val, f"abuse-{target_type}")
    target_masked = mask_target_value(target_type, clean_val)

    return await db.rpc(
        "dispatch",
        {
            "command": {
                "op": "abuse_rule_save",
                "actor": actor_id,
                "target_type": target_type,
                "target_hash": target_hash,
                "target_masked": target_masked,
                "action": action,
                "reason": reason,
                "duration_hours": duration_hours,
            }
        },
    )
