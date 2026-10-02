import io
import warnings

from PIL import Image, UnidentifiedImageError

from pagefpt.core.errors import DomainError


def validate_image(data: bytes) -> dict:
    if len(data) > 10 * 1024 * 1024:
        raise DomainError("MEDIA_TOO_LARGE", 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.width * image.height > 40000000 or image.format not in {
                    "JPEG",
                    "PNG",
                    "WEBP",
                }:
                    raise DomainError("INVALID_MEDIA", 422)
                image.load()
                output = io.BytesIO()
                image.convert("RGB").save(output, format="WEBP", quality=85)
                return {
                    "data": output.getvalue(),
                    "mime": "image/webp",
                    "width": image.width,
                    "height": image.height,
                }
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise DomainError("INVALID_MEDIA", 422) from exc
