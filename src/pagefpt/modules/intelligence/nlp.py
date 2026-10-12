"""Conservative Vietnamese rules. Suggestions never become confirmed facts."""

import re
import unicodedata

VERSION = "notes-v2"
PATTERNS = [
    ("floors", r"(\d{1,2})\s*tầng", None),
    ("devices", r"(\d{1,3})\s*(?:thiết bị|máy)", None),
    ("installation_days", r"(\d{1,2})\s*ngày", None),
    ("service", r"\bcamera\b", "camera"),
    ("service", r"\b(?:wifi|internet|mạng)\b", "internet"),
    ("service", r"\b(?:truyền hình|fpt play)\b", "play"),
]


def extract_needs(text: str) -> list[dict]:
    text = unicodedata.normalize("NFC", text[:2000])
    results: list[dict] = []
    for field, pattern, service in PATTERNS:
        for match in re.finditer(pattern, text, re.I):
            value = service if service is not None else int(match[1])
            if value == 0:
                continue
            # Bound negation to the current clause; do not carry it across "chỉ cần".
            start = max(
                (
                    m.end()
                    for m in re.finditer(
                        r"[,.!?;\n]|\b(?:nhưng|mà còn|chỉ cần)\b", text[: match.start()], re.I
                    )
                ),
                default=0,
            )
            prefix = text[start : match.start()].lower()
            prefix = re.sub(r"\bkhông (?:chỉ|những)\b", "", prefix)
            negated = bool(re.search(r"\b(?:không|chưa|chẳng|khỏi|bỏ|ngừng)\b", prefix))
            suffix = text[match.end() :].lower()
            suffix = re.sub(r"\bkhông (?:chỉ|những)\b", "", suffix)
            negated = negated or bool(
                re.match(r"\s*(?:thì\s+)?(?:không|chưa|chẳng|khỏi|bỏ|ngừng)\b", suffix)
            )
            end = re.search(r"[,.!?;\n]", text[match.end() :])
            clause = text[start : match.end() + end.start() if end else len(text)].lower()
            uncertain = bool(
                re.search(r"\b(?:nếu|giả sử|có thể|dự định|bao nhiêu)\b", clause)
                or (end and end.group(0) == "?")
            )
            results.append(
                {
                    "field": field,
                    "value": value,
                    "polarity": "negative" if negated else "positive",
                    "source": "notes_rule",
                    "source_version": VERSION,
                    "status": "needs_review" if negated or uncertain else "inferred",
                    "evidence_span": [match.start(), match.end()],
                }
            )
    for item in results:
        siblings = [
            x
            for x in results
            if x["field"] == item["field"]
            and (item["field"] != "service" or x["value"] == item["value"])
        ]
        if len({(str(x["value"]), x["polarity"]) for x in siblings}) > 1:
            for sibling in siblings:
                sibling["status"] = "needs_review"
    return results
