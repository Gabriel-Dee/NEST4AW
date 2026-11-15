"""Real PaddleOCR in a bounded worker process; no fabricated extraction."""

import io
import multiprocessing
import re
import threading
from concurrent.futures import ProcessPoolExecutor, TimeoutError

import zxingcpp
from PIL import Image, ImageOps, UnidentifiedImageError

from app.errors import APIError
from app.services.nutrition import convert

MAX_BYTES = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 12_000_000
_lock = threading.Lock()
_pool = None
_model = None


def validate_image(raw):
    if not raw or len(raw) > MAX_BYTES:
        raise APIError(422, "invalid_image", "image must be between 1 byte and 8 MB")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if (
                image.format not in ("PNG", "JPEG", "WEBP")
                or image.width * image.height > 12_000_000
            ):
                raise APIError(422, "invalid_image", "use a PNG, JPEG, or WebP under 12 megapixels")
            image.load()
            return ImageOps.exif_transpose(image).convert("RGB")
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise APIError(422, "invalid_image", "image could not be decoded") from None


def barcodes(image):
    return sorted(
        {r.text for r in zxingcpp.read_barcodes(image) if re.fullmatch(r"\d{8,14}", r.text)}
    )


def _predict(raw):
    global _model
    import numpy as np
    from paddleocr import PaddleOCR

    if _model is None:
        _model = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="en_PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=True,
            device="cpu",
        )
    image = validate_image(raw)
    image.thumbnail((2400, 2400))
    lines = []
    for page in _model.predict(np.asarray(image)):
        for text, score in zip(page["rec_texts"], page["rec_scores"]):
            lines.append({"text": str(text), "confidence": float(score)})
    return lines


def extract(raw, timeout):
    global _pool
    # One inference at a time; bounded queue and model reuse between requests.
    if not _lock.acquire(blocking=False):
        raise APIError(503, "ocr_busy", "scanner is busy; retry shortly")
    try:
        if _pool is None:
            _pool = ProcessPoolExecutor(
                max_workers=1, mp_context=multiprocessing.get_context("spawn")
            )
        future = _pool.submit(_predict, raw)
        try:
            return future.result(timeout=timeout)
        except TimeoutError:
            # Terminate hung workers so repeated timeouts cannot accumulate processes.
            for process in list((_pool._processes or {}).values()):
                process.terminate()
            _pool.shutdown(wait=False, cancel_futures=True)
            _pool = None
            raise APIError(503, "ocr_timeout", "label extraction timed out") from None
        except Exception:
            raise APIError(503, "ocr_unavailable", "label extraction unavailable") from None
    finally:
        _lock.release()


LABELS = {
    "sodium_mg": "sodium",
    "potassium_mg": "potassium",
    "phosphorus_mg": "phosphorus",
    "added_sugar_g": r"added[ \t]+sugars?",
    "carb_g": r"(?:total\s+)?carbohydrates?",
    "fiber_g": r"(?:dietary\s+)?fib(?:er|re)",
}


def parse_label(lines):
    text = "\n".join(line["text"] for line in lines)
    result = {field: None for field in LABELS}
    warnings = []
    for field, label in LABELS.items():
        # Newline joining accommodates separate OCR boxes; never infer percent DV as grams.
        matches = re.findall(label + r"\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg|g|µg|ug)\b", text, re.I)
        if field == "added_sugar_g":
            matches += re.findall(
                r"(?:includes[ \t]+)?(\d+(?:\.\d+)?)[ \t]*(g)[ \t]+added[ \t]+sugars?", text, re.I
            )
        values = {
            convert(value, unit, "mg" if field.endswith("_mg") else "g") for value, unit in matches
        }
        if len(values) == 1:
            result[field] = values.pop()
        elif len(values) > 1:
            warnings.append(f"conflicting {field}")
    ingredient = re.search(
        r"ingredients?\s*:\s*(.*?)(?=\n(?:nutrition|distributed|manufactured)|$)", text, re.I | re.S
    )
    serving = re.search(r"serving\s+size[^\n]*?(\d+(?:\.\d+)?)\s*g\b", text, re.I)
    confidence = min((line["confidence"] for line in lines), default=0.0)
    if confidence < 0.85:
        warnings.append("low OCR confidence")
    if not serving:
        warnings.append("serving basis not identified")
    return {
        **result,
        "ingredients": ingredient[1].strip() if ingredient else None,
        "serving_g": float(serving[1]) if serving else None,
        "source": "unverified OCR",
        "confidence": confidence,
        "warnings": warnings,
        "text": text,
    }
