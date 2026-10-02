"""Bounded operational metrics: never record raw URL, IP, payload or exception text."""

import json
import logging

logger = logging.getLogger("pagefpt.metrics")


def metric(name: str, value: float, **labels):
    logger.info(
        json.dumps({"metric": name, "value": round(value, 3), **labels}, separators=(",", ":"))
    )
