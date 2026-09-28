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
        "payment_method":  "Funding Account", (optional — defaults to "Funding Account")
        "device_name":     "apple"            (optional — defaults to "apple", can be "apple" or "android")
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

# Template path is determined dynamically based on device_name

# Dark background color sampled from the template (used to erase old text)
BG_DARK = (35, 37, 50)

# Text colors matched from the template
COLOR_WHITE = (255, 255, 255)
COLOR_GREY = (180, 185, 195)
COLOR_USDT = (230, 230, 230)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find(name):
    import os
    apple_fonts_dir = os.path.join(os.path.dirname(__file__), "apple_fonts")
    font_dirs = [
        apple_fonts_dir,
        os.path.dirname(__file__),
        "apple_fonts",
        ".",
        "/var/task",
        "C:/Windows/Fonts",
        "/usr/share/fonts/noto",
        "/usr/share/fonts/TTF",
    ]
    fallbacks = {
        "SFPRODISPLAYBOLD.OTF": ["arialbd.ttf", "NotoSans-Bold.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
        "SFPRODISPLAYMEDIUM.OTF": ["arialmd.ttf", "arialbd.ttf", "NotoSans-Medium.ttf", "LiberationSans-Regular.ttf"],
        "SFPRODISPLAYREGULAR.OTF": ["arial.ttf", "NotoSans-Regular.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"],
        "arial.ttf": ["SFPRODISPLAYREGULAR.OTF", "NotoSans-Regular.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"],
        "arialbd.ttf": ["SFPRODISPLAYBOLD.OTF", "NotoSans-Bold.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
        "arialmd.ttf": ["SFPRODISPLAYMEDIUM.OTF", "NotoSans-Medium.ttf", "NotoSans-SemiBold.ttf", "LiberationSans-Regular.ttf"]
    }

    def search_dir(d, target_name):
        if not os.path.exists(d):
            return None
        path = os.path.join(d, target_name)
        if os.path.exists(path):
            return path
        target_lower = target_name.lower()
        try:
            for fname in os.listdir(d):
                if fname.lower() == target_lower:
                    return os.path.join(d, fname)
        except Exception:
            pass
        return None

    for d in font_dirs:
        res = search_dir(d, name)
        if res:
            return res

    if name in fallbacks:
        for fb_name in fallbacks[name]:
            for d in font_dirs:
                res = search_dir(d, fb_name)
                if res:
                    return res

    return name  # let PIL try system lookup


def _load_fonts():
    """Load fonts matching the Binance screenshot style."""
    from PIL import ImageFont

    def safe_font(name, size):
        try:
            return ImageFont.truetype(_find(name), size)
        except Exception:
            return ImageFont.load_default()

    return {
        "amount_large": safe_font("arialbd.ttf", 42),
        "to_name":      safe_font("arial.ttf", 22),
        "to_id":        safe_font("arial.ttf", 19),
        "order_id":     safe_font("arial.ttf", 21),
        "method_val":   safe_font("arial.ttf", 21),
        "paid_val":     safe_font("arial.ttf", 22),
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


def validate_and_extract_wallet(address_raw: str) -> str:
    """
    Validates an Ethereum address and extracts its ENS name if available.
    For non-Ethereum addresses (e.g. Bitcoin, Tron), safely falls back to a shortened format.
    Raises ValueError if the address is empty or fundamentally invalid.
    """
    import re
    if not address_raw:
        raise ValueError("invalid address given")
        
    # Only attempt ENS resolution for Ethereum addresses (starting with 0x)
    if address_raw.startswith("0x"):
        from web3 import Web3
        # Use public RPC for ENS resolution with a 3 second timeout
        w3 = Web3(Web3.HTTPProvider('https://ethereum-rpc.publicnode.com', request_kwargs={'timeout': 3}))
        
        if not w3.is_address(address_raw):
            raise ValueError("invalid address given")
            
        address = w3.to_checksum_address(address_raw)
        
        try:
            name = w3.ens.name(address)
            if name:
                return name
        except Exception as e:
            print(f"ENS resolution failed or timed out for {address}: {e}")
            
        # Fallback to shortened Ethereum address if no ENS name exists
        return f"{address[:6]}...{address[-4:]}"
        
    # For non-Ethereum addresses (like Bitcoin, Tron)
    # BTC (Starts with 1, 3, or bc1)
    is_btc = re.match(r'^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,59}$', address_raw)
    # Tron (Starts with T, 34 chars base58)
    is_tron = re.match(r'^T[a-zA-HJ-NP-Z0-9]{33}$', address_raw)
    
    if is_btc or is_tron:
        return f"{address_raw[:6]}...{address_raw[-4:]}"
        
    raise ValueError("invalid address given")


def _fit_right_aligned(draw, text: str, font, max_width: int) -> str:
    """Middle-truncate `text` so its rendered width never exceeds `max_width`."""
    def fits(s: str) -> bool:
        bbox = draw.textbbox((0, 0), s, font=font)
        return (bbox[2] - bbox[0]) <= max_width
    return _middle_truncate(text, fits)


def _get_apple_status_time() -> str:
    """Return current status bar time string for Apple screenshots."""
    import datetime
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    t_str = now_utc.strftime("%H:%M")
    if t_str.startswith("0") and len(t_str) > 1 and t_str[1] != ":":
        t_str = t_str[1:]
    return t_str


def _get_android_status_time() -> str:
    """Return current status bar time string for Android screenshots."""
    import datetime
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    t_str = now_utc.strftime("%H:%M")
    if t_str.startswith("0") and len(t_str) > 1 and t_str[1] != ":":
        t_str = t_str[1:]
    return t_str


def generate_apple_screenshot(
    amount: str,
    to_address: str,
    to_id: str = None,
    order_id: str = None,
    payment_method: str = "Funding Account",
) -> "Image.Image":
    """
    Generate a payment-successful screenshot for Apple.
    """
    from PIL import Image, ImageDraw
    import datetime

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    status_time = _get_apple_status_time()
    
    # Automatically validate and extract wallet name
    to_address = validate_and_extract_wallet(to_address)

    if order_id is None:
        order_id = generate_order_id()
    if to_id is None:
        to_id = str(random.randint(100000000, 999999999))

    amount_display = f"{amount} USDT"
    template_path = os.path.join(os.path.dirname(__file__), "input", "baseimg", "apple.png")
    img = Image.open(template_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    # Apple scale fonts manually
    from PIL import ImageFont
    def safe_font(name, sz):
        try: return ImageFont.truetype(_find(name), sz)
        except Exception: return ImageFont.load_default()
    
    fonts = {}
    img_w, img_h = img.size
    fonts["amount_large"] = safe_font("SFPRODISPLAYBOLD.OTF", int(38 * (918/576.0)))
    fonts["to_name"] = safe_font("SFPRODISPLAYREGULAR.OTF", int(21 * (918/576.0)))
    fonts["to_id"] = safe_font("SFPRODISPLAYREGULAR.OTF", int(19 * (918/576.0)))
    fonts["order_id"] = safe_font("SFPRODISPLAYREGULAR.OTF", int(19.5 * (918/576.0)))  # Font size increased from 16 to 19.5
    fonts["method_val"] = safe_font("SFPRODISPLAYREGULAR.OTF", int(21 * (918/576.0)))
    fonts["paid_val"] = safe_font("SFPRODISPLAYREGULAR.OTF", int(22 * (918/576.0)))

    # Apple exactly measured coordinates (918x1899)
    # Using exact Y-centers of the text rows from the base image template
    target_centers = {
        "amount_large":   590.5,
        "to_name":        805.0,
        "to_id":          847.5,
        "order_id":       977.0,
        "payment_method": 1056.5,
        "paid_with":      1131.0,
    }
    
    # Right-alignment points:
    # 870 is the right-edge alignment in the template.
    # 835 is used for fields with copy icons to leave adequate space.
    right_aligns = {
        "to_name":        888,
        "to_id":          888,
        "order_id":       835,  # with copy icon
        "payment_method": 888,
        "paid_with":      888,
    }

    # Erase regions (dynamically centered on original text lines)
    regions = {
        "amount_large":   (150, 560, 750, 620),
        "to_name":        (450, 785, 910, 825),   # Extended right edge to 910
        "to_id":          (600, 832, 910, 863),   # Extended right edge to 910
        "order_id":       (450, 955, 840, 999),
        "payment_method": (450, 1035, 910, 1078), # Extended right edge to 910
        "paid_with":      (450, 1110, 910, 1152), # Extended right edge to 910
    }

    # Erase each main region
    BG_APPLE = (34, 36, 48) # Exact Apple BG color (#222430)
    for name, box in regions.items():
        draw.rectangle(box, fill=BG_APPLE)

    # Helper function to draw text right-aligned and vertically centered on a specific Y-coordinate
    def draw_val(text, font, x_right, y_center, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        y_offset = bbox[1]
        draw.text((x_right - w, y_center - h/2 - y_offset), text, font=font, fill=fill)

    # 1. Large amount (centered both horizontally and vertically)
    bbox = draw.textbbox((0, 0), amount_display, font=fonts["amount_large"])
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    y_offset = bbox[1]
    x = (img_w - text_w) // 2
    draw.text((x, target_centers["amount_large"] - text_h/2 - y_offset), amount_display, font=fonts["amount_large"], fill=COLOR_WHITE)

    # 2. To — recipient name
    to_display = _fit_right_aligned(draw, to_address, fonts["to_name"], 380)
    draw_val(to_display, fonts["to_name"], right_aligns["to_name"], target_centers["to_name"], COLOR_GREY)

    # 3. To — recipient ID
    draw_val(to_id, fonts["to_id"], right_aligns["to_id"], target_centers["to_id"], COLOR_GREY)

    # 4. Order ID
    draw_val(order_id, fonts["order_id"], right_aligns["order_id"], target_centers["order_id"], COLOR_WHITE)

    # 5. Payment Method value
    draw_val(payment_method, fonts["method_val"], right_aligns["payment_method"], target_centers["payment_method"], COLOR_WHITE)

    # 6. Paid With value
    draw_val(amount_display, fonts["paid_val"], right_aligns["paid_with"], target_centers["paid_with"], COLOR_USDT)

    # 7. Status Bar Clock (top-left) - balanced font size for Apple
    draw.rectangle([85, 30, 225, 85], fill=(30, 31, 39)) # Accurate Apple status bar background
    f_clock = safe_font("SFPRODISPLAYMEDIUM.OTF", int(20.5 * (918/576.0)))
    bbox = draw.textbbox((0, 0), status_time, font=f_clock, stroke_width=1)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    y_off = bbox[1]
    draw.text((140.0 - w/2, 60.0 - h/2 - y_off), status_time, font=f_clock, fill=COLOR_WHITE, stroke_width=1, stroke_fill=(210, 210, 210))

    # Overwrite Notification Banner
    bg_banner = (184, 187, 192)
    draw.rectangle([150, 200, 880, 360], fill=bg_banner)
    
    # Load banner fonts using robust path lookup
    f_subj = fonts["to_name"]
    f_body = fonts["to_id"]
    try:
        f_subj = safe_font("SFPRODISPLAYBOLD.OTF", 32)
        f_body = safe_font("SFPRODISPLAYREGULAR.OTF", 30)
    except Exception:
        pass

    # Banner Truncation helper (places "..." if text exceeds right margin)
    def fit_banner_text(text, font, max_w):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_w:
            return text
        for i in range(len(text), 0, -1):
            candidate = text[:i] + "..."
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_w:
                return candidate
        return "..."

    dt_str = now_utc.strftime("%Y-%m-%d")
    time_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")

    # Title with margin truncation
    title_text = f"[Binance]Payment Transaction Detail - {dt_str}"
    title_display = fit_banner_text(title_text, f_subj, 710)

    # Description matching the base template layout and exact text
    body_lines = [
        "Payment Transaction Detail You made the",
        f"following payment: Time: {time_str} (UTC)..."
    ]
    body_display = []
    for line in body_lines:
        body_display.append(fit_banner_text(line, f_body, 700))
    body_text = "\n".join(body_display)

    draw.text((160, 200), title_display, font=f_subj, fill=(33, 37, 48))
    draw.text((160, 260), body_text, font=f_body, fill=(33, 37, 48))

    return img


def generate_android_screenshot(
    amount: str,
    to_address: str,
    to_id: str = None,
    order_id: str = None,
    payment_method: str = "Funding Account",
) -> "Image.Image":
    """
    Generate a payment-successful screenshot for Android.
    """
    from PIL import Image, ImageDraw
    import datetime

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    status_time = _get_android_status_time()
    
    # Automatically validate and extract wallet name
    to_address = validate_and_extract_wallet(to_address)

    if order_id is None:
        order_id = generate_order_id()
    if to_id is None:
        to_id = str(random.randint(100000000, 999999999))

    amount_display = f"{amount} USDT"
    template_path = os.path.join(os.path.dirname(__file__), "input", "baseimg", "android.png")
    img = Image.open(template_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    fonts = _load_fonts()
    img_w, img_h = img.size

    # Android exactly measured coordinates (576x1280)
    target_centers = {
        "amount_large":   416.5,
        "to_name":        572.0,
        "to_id":          603.5,
        "order_id":       696.0,
        "payment_method": 753.0,
        "paid_with":      810.0,
    }
    
    right_aligns = {
        "to_name":        542,
        "to_id":          542,
        "order_id":       515,  # Aligned to the left of the preserved copy icon
        "payment_method": 542,
        "paid_with":      542,
    }

    # Erase regions (dynamically centered on original text lines)
    regions = {
        "amount_large":   (50, 390, 526, 440),
        "to_name":        (250, 555, 560, 588),
        "to_id":          (300, 590, 560, 617),
        "order_id":       (200, 680, 520, 712),  # Stops at 520 to preserve the copy icon from the base image
        "payment_method": (300, 738, 560, 768),
        "paid_with":      (350, 795, 560, 825),
    }

    # Erase each main region
    for name, box in regions.items():
        draw.rectangle(box, fill=(22, 29, 37)) # Exact Android BG color

    # Helper function to draw text right-aligned and vertically centered
    def draw_val(text, font, x_right, y_center, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        y_offset = bbox[1]
        draw.text((x_right - w, y_center - h/2 - y_offset), text, font=font, fill=fill)

    # 1. Large amount (centered both horizontally and vertically)
    bbox = draw.textbbox((0, 0), amount_display, font=fonts["amount_large"])
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    y_offset = bbox[1]
    x = (img_w - text_w) // 2
    draw.text((x, target_centers["amount_large"] - text_h/2 - y_offset), amount_display, font=fonts["amount_large"], fill=COLOR_WHITE)

    # 2. To — recipient name
    fit_w = int(235)
    to_display = _fit_right_aligned(draw, to_address, fonts["to_name"], fit_w)
    draw_val(to_display, fonts["to_name"], right_aligns["to_name"], target_centers["to_name"], COLOR_GREY)

    # 3. To — recipient ID
    draw_val(to_id, fonts["to_id"], right_aligns["to_id"], target_centers["to_id"], COLOR_GREY)

    # 4. Order ID
    draw_val(order_id, fonts["order_id"], right_aligns["order_id"], target_centers["order_id"], COLOR_WHITE)

    # 5. Payment Method value
    draw_val(payment_method, fonts["method_val"], right_aligns["payment_method"], target_centers["payment_method"], COLOR_WHITE)

    # 6. Paid With value
    draw_val(amount_display, fonts["paid_val"], right_aligns["paid_with"], target_centers["paid_with"], COLOR_USDT)

    # 7. Status Bar Clock & 3 Random Icons + Dot (top-left)
    from PIL import ImageFont
    draw.rectangle([15, 6, 260, 58], fill=(22, 29, 37))
    def safe_font(name, sz):
        try: return ImageFont.truetype(_find(name), sz)
        except Exception: return ImageFont.load_default()
    f_clock = safe_font("arialbd.ttf", 18)
    bbox = draw.textbbox((0, 0), status_time, font=f_clock)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    y_off = bbox[1]
    time_x = 65.0 - w/2
    draw.text((time_x, 31.0 - h/2 - y_off), status_time, font=f_clock, fill=(230, 230, 230))

    # 3 Random Status Icons + Dot (placed after status bar clock time)
    icons_dir = os.path.join(os.path.dirname(__file__), "input", "icons")
    if os.path.exists(icons_dir):
        try:
            icon_files = [f for f in os.listdir(icons_dir) if f.endswith(".png")]
            if len(icon_files) >= 3:
                selected_icons = random.sample(icon_files, 3)
                curr_x = time_x + w + 8
                icon_sz = 26
                for icon_fname in selected_icons:
                    icon_path = os.path.join(icons_dir, icon_fname)
                    icon_img = Image.open(icon_path).convert("RGBA")
                    # Enhance icon quality with slight sharpening or smoothing if needed, but LANCZOS is good.
                    icon_img = icon_img.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
                    
                    # Apply border radius to the square icon with Supersampling for Anti-Aliasing (fixes pixelation)
                    from PIL import ImageDraw as PIDraw
                    scale = 4
                    mask = Image.new("L", (icon_sz * scale, icon_sz * scale), 0)
                    mask_draw = PIDraw.Draw(mask)
                    mask_draw.rounded_rectangle([0, 0, icon_sz * scale, icon_sz * scale], radius=4 * scale, fill=255)
                    mask = mask.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
                    
                    # Preserve any existing transparency while applying the anti-aliased rounded mask
                    r, g, b, a = icon_img.split()
                    from PIL import ImageChops
                    icon_img.putalpha(ImageChops.multiply(a, mask))
                    
                    icon_y = int(31.0 - icon_sz / 2)
                    img.paste(icon_img, (int(curr_x), icon_y), icon_img)
                    curr_x += icon_sz - 4
                
                # Draw dot after the 3 icons
                dot_x = curr_x + 10
                dot_r = 3.0
                draw.ellipse([dot_x - dot_r, 31.0 - dot_r, dot_x + dot_r, 31.0 + dot_r], fill=(180, 185, 195))
        except Exception:
            pass

    # Overwrite Notification Banner (shifted 5px left, slightly smaller box)
    bg_banner = (45, 50, 56)
    draw.rectangle([35, 72, 495, 132], fill=bg_banner)
    
    # Load banner fonts using global _find function
    f_title = fonts["to_name"]
    f_body = fonts["to_id"]
    try:
        from PIL import ImageFont
        f_title = ImageFont.truetype(_find("arialbd.ttf"), 21)
        f_body = ImageFont.truetype(_find("arial.ttf"), 18)
    except Exception:
        pass
        
    draw.text((40, 75), f"Paid {amount} USDT Successfully", font=f_title, fill=(230, 230, 230))
    dt_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")
    draw.text((40, 107), f"You paid {amount} USDT on {dt_str} (UTC)", font=f_body, fill=(180, 185, 195))

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

        try:
            device_name = params.get("device_name", "apple")
            if device_name == "android":
                img = generate_android_screenshot(
                    amount=amount,
                    to_address=to_address,
                    to_id=params.get("to_id"),
                    order_id=params.get("order_id"),
                    payment_method=params.get("payment_method", "Funding Account"),
                )
            else:
                img = generate_apple_screenshot(
                    amount=amount,
                    to_address=to_address,
                    to_id=params.get("to_id"),
                    order_id=params.get("order_id"),
                    payment_method=params.get("payment_method", "Funding Account"),
                )
        except ValueError as e:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": str(e)
                }),
            }

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
