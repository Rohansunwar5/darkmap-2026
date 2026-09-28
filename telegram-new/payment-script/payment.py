"""
AWS Lambda function to generate a Binance-style payment screenshot.

Takes dynamic values (amount, to_address, payment_method) and overlays
them onto the template image, returning a PNG.

Invoke with JSON body (POST) or query params (GET):
    {
        "amount":          "2000",
        "to_address":      "royal urban store",
        "to_id":           "993891536",       (optional — auto-generated)
        "order_id":        "319843815...",     (optional — auto-generated)
        "payment_method":  "Funding Account"  (optional — defaults to "Funding Account")
    }
"""

import json
import base64
import io
import os
import random
import string
# PIL is imported lazily inside the functions that need it, so this module (and its
# __main__ self-check) can be imported/run in environments without the Pillow binary.


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "Input", "IMG-20260629-WA0003.jpg.jpeg")

# Dark background color sampled from the template (used to erase old text)
BG_DARK = (35, 37, 50)

# Text colors matched from the template
COLOR_WHITE = (255, 255, 255)
COLOR_GREY = (180, 185, 195)
COLOR_USDT = (230, 230, 230)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_fonts():
    """Load fonts matching the Binance screenshot style."""
    from PIL import ImageFont
    # On Lambda, bundle fonts alongside the code.
    # Fallback chain: local dir → /var/task (Lambda) → Windows fonts
    font_dirs = [os.path.dirname(__file__), ".", "/var/task", "C:/Windows/Fonts"]

    def _find(name):
        for d in font_dirs:
            path = os.path.join(d, name)
            if os.path.exists(path):
                return path
        return name  # let PIL try system lookup

    return {
        "amount_large": ImageFont.truetype(_find("arialbd.ttf"), 42),
        "to_name":      ImageFont.truetype(_find("arial.ttf"), 22),
        "to_id":        ImageFont.truetype(_find("arial.ttf"), 19),
        "order_id":     ImageFont.truetype(_find("arial.ttf"), 21),
        "method_val":   ImageFont.truetype(_find("arial.ttf"), 21),
        "paid_val":     ImageFont.truetype(_find("arial.ttf"), 22),
    }


def generate_order_id() -> str:
    """Generate a random 18-digit numeric order ID (like Binance)."""
    return "".join(random.choices(string.digits, k=18))


def _middle_truncate(text: str, fits, ellipsis: str = "...") -> str:
    """Shrink `text` to satisfy `fits(s)` by dropping characters from the middle,
    keeping the head and tail — e.g. a long wallet renders as 0x3a1A02…5699774
    (how real crypto UIs show addresses) instead of overflowing the layout.
    `fits` is injected so the pixel-width measurement can be unit-tested without PIL."""
    if fits(text):
        return text
    head = tail = len(text) // 2
    while head + tail > 2:
        candidate = text[:head] + ellipsis + text[-tail:]
        if fits(candidate):
            return candidate
        if head >= tail:
            head -= 1
        else:
            tail -= 1
    return ellipsis


def _fit_right_aligned(draw, text: str, font, max_width: int) -> str:
    """Middle-truncate `text` so its rendered width never exceeds `max_width`."""
    def fits(s: str) -> bool:
        bbox = draw.textbbox((0, 0), s, font=font)
        return (bbox[2] - bbox[0]) <= max_width
    return _middle_truncate(text, fits)


def generate_payment_screenshot(
    amount: str,
    to_address: str,
    to_id: str = None,
    order_id: str = None,
    payment_method: str = "Funding Account",
) -> "Image.Image":
    """
    Generate a payment-successful screenshot.

    Args:
        amount:          USDT amount (e.g. "2000")
        to_address:      Recipient name / wallet / store name
        to_id:           Recipient ID (auto-generated if None)
        order_id:        Order ID (auto-generated if None)
        payment_method:  Payment method label

    Returns:
        PIL Image with overlaid text.
    """
    from PIL import Image, ImageDraw

    if order_id is None:
        order_id = generate_order_id()
    if to_id is None:
        to_id = str(random.randint(100000000, 999999999))

    amount_display = f"{amount} USDT"
    img = Image.open(TEMPLATE_PATH).convert("RGB")
    draw = ImageDraw.Draw(img)
    fonts = _load_fonts()
    img_w, img_h = img.size

    # Region definitions: (x1, y1, x2, y2) — areas to erase then redraw
    regions = {
        "amount_large":   (95,  255, 445, 312),
        "to_name":        (275, 436, 520, 466),
        "to_id":          (345, 466, 520, 498),
        "order_id":       (215, 550, 485, 598),
        "payment_method": (305, 600, 520, 650),
        "paid_with":      (340, 652, 520, 692),
    }

    # Erase each region by filling with background color
    for name, box in regions.items():
        draw.rectangle(box, fill=BG_DARK)

    # 1. Large amount (centered)
    bbox = draw.textbbox((0, 0), amount_display, font=fonts["amount_large"])
    text_w = bbox[2] - bbox[0]
    x = (img_w - text_w) // 2
    draw.text((x, 260), amount_display, font=fonts["amount_large"], fill=COLOR_WHITE)

    # 2. To — recipient name (right-aligned). Fit long wallet addresses to the
    #    available width (~235px, ending at x=510) so they don't run off the image.
    to_display = _fit_right_aligned(draw, to_address, fonts["to_name"], 235)
    bbox = draw.textbbox((0, 0), to_display, font=fonts["to_name"])
    text_w = bbox[2] - bbox[0]
    draw.text((510 - text_w, 440), to_display, font=fonts["to_name"], fill=COLOR_GREY)

    # 3. To — recipient ID (right-aligned)
    bbox = draw.textbbox((0, 0), to_id, font=fonts["to_id"])
    text_w = bbox[2] - bbox[0]
    draw.text((510 - text_w, 472), to_id, font=fonts["to_id"], fill=COLOR_GREY)

    # 4. Order ID (right-aligned, before the copy icon)
    bbox = draw.textbbox((0, 0), order_id, font=fonts["order_id"])
    text_w = bbox[2] - bbox[0]
    draw.text((480 - text_w, 555), order_id, font=fonts["order_id"], fill=COLOR_WHITE)

    # 5. Payment Method value (right-aligned)
    bbox = draw.textbbox((0, 0), payment_method, font=fonts["method_val"])
    text_w = bbox[2] - bbox[0]
    draw.text((510 - text_w, 610), payment_method, font=fonts["method_val"], fill=COLOR_WHITE)

    # 6. Paid With value (right-aligned)
    bbox = draw.textbbox((0, 0), amount_display, font=fonts["paid_val"])
    text_w = bbox[2] - bbox[0]
    draw.text((510 - text_w, 660), amount_display, font=fonts["paid_val"], fill=COLOR_USDT)

    return img


# ---------------------------------------------------------------------------
# Lambda handler
# ---------------------------------------------------------------------------

def lambda_handler(event, context):
    """AWS Lambda entry point."""
    try:
        # Extract parameters from body (POST) or query string (GET)
        params = event.get("queryStringParameters", {}) or {}
        if not params and event.get("body"):
            try:
                body = json.loads(event["body"])
                params = body if isinstance(body, dict) else {}
            except json.JSONDecodeError:
                pass

        amount = params.get("amount")
        to_address = params.get("to_address")

        if not amount or not to_address:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": "'amount' and 'to_address' are required parameters."
                }),
            }

        img = generate_payment_screenshot(
            amount=amount,
            to_address=to_address,
            to_id=params.get("to_id"),
            order_id=params.get("order_id"),
            payment_method=params.get("payment_method", "Funding Account"),
        )

        # Encode to base64 PNG for API Gateway binary response
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode("utf-8")

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "image/png",
                "Access-Control-Allow-Origin": "*",
            },
            "body": img_base64,
            "isBase64Encoded": True,
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


if __name__ == "__main__":
    # Self-check for the truncation logic (no PIL needed). Uses a char-count proxy
    # for pixel width so it runs anywhere.
    def _fits(limit):
        return lambda s: len(s) <= limit

    long_addr = "0x3a1A02794dFa52f2F28e42ADe8373De5C5699774"
    out = _middle_truncate(long_addr, _fits(18))
    assert len(out) <= 18, out
    assert out.startswith("0x") and out.endswith("9774"), out
    assert "..." in out, out

    # Short values pass through untouched.
    assert _middle_truncate("royal urban store", _fits(20)) == "royal urban store"
    # Degenerate case never loops forever.
    assert _middle_truncate("abcdefgh", _fits(1)) == "..."

    print("payment.py self-check passed. sample:", out)
