"""Re-extrae assets limpios de la plantilla oficial (sin texto/iconos pegados)."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "src" / "assets" / "brand"
SRC = BRAND / "plantilla-cotizacion.jpg"
PREVIEW = BRAND / "_preview"


def save(im: Image.Image, path: Path, quality: int = 92) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    rgb.save(path, "JPEG", quality=quality, optimize=True)
    print(f"wrote {path.name} {rgb.size}")


def soft_vignette(im: Image.Image, strength: float = 0.35) -> Image.Image:
    """Darken edges slightly so the photo blends into UI panels."""
    w, h = im.size
    overlay = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(overlay)
    margin_x = int(w * 0.08)
    margin_y = int(h * 0.12)
    draw.ellipse((-margin_x, -margin_y, w + margin_x, h + margin_y), fill=255)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(w, h) // 10))
    dark = Image.new("RGB", (w, h), (6, 38, 28))
    base = im.convert("RGB")
    return Image.composite(base, Image.blend(base, dark, strength), overlay)


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    print("plantilla", w, h)
    PREVIEW.mkdir(parents=True, exist_ok=True)

    # --- Hero bird: crop the photographic subject only (no gold wave, no green pills) ---
    # Empirically tuned on 682x1024 plantilla.
    bird = im.crop((int(w * 0.30), int(h * 0.015), int(w * 0.70), int(h * 0.175)))
    bird = bird.resize((720, 480), Image.Resampling.LANCZOS)
    # Trim residual gold-wave seam at the bottom by slight crop + soft fade
    bird = bird.crop((0, 0, bird.width, int(bird.height * 0.92)))
    bird = ImageEnhance.Color(bird).enhance(1.08)
    bird = ImageEnhance.Contrast(bird).enhance(1.05)
    save(bird, BRAND / "quote-hero-bird.jpg", 93)
    save(bird, PREVIEW / "bird_clean.jpg", 93)

    # Wider hero strip for optional full-bleed use (logo area excluded)
    hero_photo = im.crop((int(w * 0.26), 0, int(w * 0.78), int(h * 0.185)))
    hero_photo = hero_photo.resize((900, 420), Image.Resampling.LANCZOS)
    # Fade bottom into transparent-ish dark green via soft crop of wave
    hero_photo = hero_photo.crop((0, 0, hero_photo.width, int(hero_photo.height * 0.9)))
    save(hero_photo, BRAND / "quote-hero-band.jpg", 92)
    save(hero_photo, PREVIEW / "hero_band.jpg", 92)

    # Left foliage ambience without the baked logo text if possible — keep soft leaves only
    foliage = im.crop((0, int(h * 0.01), int(w * 0.28), int(h * 0.16)))
    foliage = foliage.resize((480, 360), Image.Resampling.LANCZOS)
    foliage = ImageEnhance.Brightness(foliage).enhance(1.05)
    save(foliage, BRAND / "quote-header-foliage.jpg", 90)

    # --- Footer landscape: ONLY mountains — no contact bar, icons, slogan, yellow slash ---
    # Contact bar ~ bottom 18%; landscape sits under it; right third has green slogan panel.
    top = int(h * 0.875)
    bottom = h
    left = 0
    right = int(w * 0.62)  # stop before dark slogan panel
    land = im.crop((left, top, right, bottom))
    # Push crop down a bit more if residual bar pixels remain
    if land.height > 40:
        land = land.crop((0, int(land.height * 0.12), land.width, land.height))
    land = land.resize((1200, 360), Image.Resampling.LANCZOS)
    land = ImageEnhance.Color(land).enhance(1.06)
    land = soft_vignette(land, 0.28)
    save(land, BRAND / "quote-footer-landscape.jpg", 92)
    save(land, PREVIEW / "land_clean.jpg", 92)

    # Also try a cleaner Cocora photo as alternate landscape (day-greened)
    cocora_path = BRAND / "login-cocora-sunset.jpg"
    if cocora_path.exists():
        cocora = Image.open(cocora_path).convert("RGB")
        cw, ch = cocora.size
        # Take a wide mid band of green hills if present
        band = cocora.crop((0, int(ch * 0.28), cw, int(ch * 0.72)))
        band = band.resize((1400, 380), Image.Resampling.LANCZOS)
        # Cool/green cast to match brand (sunset can be too orange)
        r, g, b = band.split()
        g = g.point(lambda p: min(255, int(p * 1.08)))
        b = b.point(lambda p: min(255, int(p * 0.95)))
        r = r.point(lambda p: min(255, int(p * 0.92)))
        band = Image.merge("RGB", (r, g, b))
        band = soft_vignette(band, 0.22)
        save(band, BRAND / "quote-footer-cocora.jpg", 90)
        save(band, PREVIEW / "land_cocora.jpg", 90)

    print("done")


if __name__ == "__main__":
    main()
