"""Offline format/prefix metadata; this does not verify ownership, activity or MNP."""

import phonenumbers
from phonenumbers import carrier

from pagefpt.core.crypto import normalize_phone


def phone_signals(value: str) -> dict:
    number = phonenumbers.parse(normalize_phone(value), "VN")
    kind = phonenumbers.number_type(number)
    mobile = kind in {
        phonenumbers.PhoneNumberType.MOBILE,
        phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
    }
    prefix_name = carrier.name_for_number(number, "en") if mobile else ""
    return {
        "format_valid": True,
        "number_type": "mobile"
        if mobile
        else "fixed_line"
        if kind == phonenumbers.PhoneNumberType.FIXED_LINE
        else "other",
        "source": "libphonenumber-prefix-metadata",
        "source_version": phonenumbers.__version__,
        "prefix_carrier": {
            "status": "inferred" if prefix_name else "unknown",
            "value": prefix_name or None,
        },
        "current_carrier": {
            "status": "unknown",
            "value": None,
            "reason": "mobile_number_portability_requires_verified_provider",
        },
        "home_isp": {"status": "unknown", "value": None},
        "owner_verified": False,
    }
