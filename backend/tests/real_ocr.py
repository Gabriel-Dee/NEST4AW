"""Manual real-inference smoke test: python -m tests.real_ocr (or run this file)."""

import io
import json
import time

from PIL import Image, ImageDraw, ImageFont

from app.services.ocr import extract, parse_label


def main():
    image = Image.new("RGB", (1200, 850), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 42)
    except OSError:
        font = ImageFont.load_default(size=42)
    lines = [
        "NUTRITION FACTS",
        "Serving size 100 g",
        "Sodium 120 mg",
        "Potassium 80 mg",
        "Phosphorus 40 mg",
        "Total Carbohydrate 20 g",
        "Dietary Fiber 3 g",
        "Added Sugars 2 g",
        "Ingredients: oats, milk",
    ]
    for i, line in enumerate(lines):
        draw.text((50, 40 + 80 * i), line, font=font, fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    start = time.monotonic()
    result = parse_label(extract(buffer.getvalue(), 180))
    assert result["sodium_mg"] == 120, result
    assert result["potassium_mg"] == 80, result
    assert result["added_sugar_g"] == 2, result
    print(
        json.dumps(
            {"elapsed_seconds": round(time.monotonic() - start, 2), "result": result}, indent=2
        )
    )


if __name__ == "__main__":
    main()
