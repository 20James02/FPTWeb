import io

import pytest
from PIL import Image


def test_media_validate_and_reencode():
    from pagefpt.core.errors import DomainError
    from pagefpt.modules.media.validation import validate_image

    b = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(b, "JPEG")
    result = validate_image(b.getvalue())
    assert result["width"] == 10 and result["mime"] == "image/webp"
    with pytest.raises(DomainError):
        validate_image(b"<svg><script>alert(1)</script></svg>")


def test_ab_stable_and_unknown_no_assignment():
    from pagefpt.modules.marketing.experiments import assign_variant

    variants = [{"name": "a", "weight": 5000}, {"name": "b", "weight": 5000}]
    assert assign_variant("secret", "session1", variants) == assign_variant(
        "secret", "session1", variants
    )
    assert assign_variant("secret", None, variants) == "a"


def test_export_cells_safe():
    from pagefpt.modules.governance.exports import safe_cell

    assert safe_cell('=HYPERLINK("x")').startswith("'")
    assert safe_cell("0901234567") == "0901234567"
