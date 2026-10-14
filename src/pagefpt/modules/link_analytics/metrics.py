from math import sqrt


def wilson(successes: int, samples: int) -> tuple[float, float] | None:
    """Descriptive 95% interval for a binary measured-journey outcome."""
    if samples <= 0 or not 0 <= successes <= samples:
        return None
    z = 1.959963984540054
    p = successes / samples
    denominator = 1 + z * z / samples
    center = (p + z * z / (2 * samples)) / denominator
    half = z * sqrt(p * (1 - p) / samples + z * z / (4 * samples * samples)) / denominator
    return max(0.0, center - half), min(1.0, center + half)


def rank_measured(visits: int, forms: int, closed: int) -> dict:
    form_interval = wilson(forms, visits)
    closed_interval = wilson(closed, visits)
    valid = form_interval is not None and closed_interval is not None and closed <= forms
    state = "invalid" if visits and not valid else "ready" if visits >= 30 else "insufficient"
    return {
        "state": state,
        "samples": visits,
        "form_rate": forms / visits if valid else None,
        "closed_rate": closed / visits if valid else None,
        "form_interval": form_interval,
        "closed_interval": closed_interval,
        "score": round(closed_interval[0] * 100, 2)
        if state == "ready" and closed_interval is not None
        else None,
        "maturity_days": 7,
        "minimum_samples": 30,
    }
