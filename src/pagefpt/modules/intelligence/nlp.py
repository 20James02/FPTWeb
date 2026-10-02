import re
import unicodedata


def extract_needs(text: str) -> list[dict]:
    text = unicodedata.normalize("NFC", text[:2000])
    results = []
    for field, pattern in [
        ("floors", r"(\d{1,2})\s*tầng"),
        ("devices", r"(\d{1,3})\s*(?:thiết bị|máy)"),
        ("installation_days", r"(\d{1,2})\s*ngày"),
    ]:
        match = re.search(pattern, text, re.I)
        if match and int(match[1]) > 0:
            results.append(
                {
                    "field": field,
                    "value": int(match[1]),
                    "source": "notes_rule",
                    "status": "inferred",
                    "evidence_span": [match.start(), match.end()],
                }
            )
    for value, pattern in [
        ("camera", r"\bcamera\b"),
        ("internet", r"\b(?:wifi|internet|mạng)\b"),
        ("play", r"\b(?:truyền hình|fpt play)\b"),
    ]:
        match = re.search(pattern, text, re.I)
        if match:
            results.append(
                {
                    "field": "service",
                    "value": value,
                    "source": "notes_rule",
                    "status": "inferred",
                    "evidence_span": [match.start(), match.end()],
                }
            )
    return results
