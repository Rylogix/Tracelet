"""One-shot untrusted file parser. No network, no user-controlled command arguments."""

import io
import json
import sys
import warnings


def analyze(data):
    if data.startswith(b"%PDF-"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data), strict=True)
        return {
            "source": "pypdf",
            "title": "PDF properties",
            "value": {
                "pages": len(reader.pages),
                "metadata": {
                    str(k): str(v)[:1000] for k, v in (reader.metadata or {}).items()
                },
            },
        }
    from PIL import Image, ExifTags

    Image.MAX_IMAGE_PIXELS = 20_000_000
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return {
            "source": "Pillow",
            "title": "Image properties",
            "value": {
                "format": image.format,
                "width": image.width,
                "height": image.height,
                "metadata": {
                    ExifTags.TAGS.get(k, str(k)): str(v)[:1000]
                    for k, v in image.getexif().items()
                },
            },
        }


if __name__ == "__main__":
    try:
        if sys.platform != "win32":
            import resource

            resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
            resource.setrlimit(
                resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024)
            )
            resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
        data = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
        if len(data) > 10 * 1024 * 1024:
            raise ValueError("Too large")
        print(json.dumps(analyze(data)))
    except Exception:
        sys.exit(1)
