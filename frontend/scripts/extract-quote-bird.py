"""Extrae un crop limpio del ave y limpia restos de la plantilla."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "src" / "assets" / "brand"
SRC = BRAND / "plantilla-cotizacion.jpg"


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size

    # Tight bird-only crop (avoid logo fade + green pills + gold wave)
    left = int(w * 0.38)
    top = int(h * 0.008)
    right = int(w * 0.665)
    bottom = int(h * 0.168)
    bird = im.crop((left, top, right, bottom))

    # Drop residual gold wave strip at bottom
    bird = bird.crop((0, 0, bird.width, int(bird.height * 0.86)))
    bird = bird.resize((800, 520), Image.Resampling.LANCZOS)
    bird = ImageEnhance.Color(bird).enhance(1.1)
    bird = ImageEnhance.Contrast(bird).enhance(1.06)
    bird = ImageEnhance.Sharpness(bird).enhance(1.15)

    # Soft left/right edge fade to forest green so CSS can blend without hard box
    faded = bird.copy()
    overlay = Image.new("RGBA", faded.size, (10, 61, 46, 0))
    mask = Image.new("L", faded.size, 0)
    draw = ImageDraw.Draw(mask)
    fade = int(faded.width * 0.18)
    for x in range(fade):
        alpha = int(255 * (1 - x / fade))
        draw.line([(x, 0), (x, faded.height)], fill=alpha)
    for x in range(faded.width - fade, faded.width):
        alpha = int(255 * ((x - (faded.width - fade)) / fade))
        draw.line([(x, 0), (x, faded.height)], fill=alpha)
    # Soft bottom fade (remove seam feel)
    bf = int(faded.height * 0.2)
    for y in range(faded.height - bf, faded.height):
        alpha = int(255 * ((y - (faded.height - bf)) / bf) * 0.85)
        draw.line([(0, y), (faded.width, y)], fill=max(mask.getpixel((faded.width // 2, y)), alpha))
    mask = mask.filter(ImageFilter.GaussianBlur(8))
    green = Image.new("RGB", faded.size, (10, 61, 46))
    blended = Image.composite(green, faded, mask)
    blended.save(BRAND / "quote-hero-bird.jpg", "JPEG", quality=94, optimize=True)
    print("bird", blended.size)

    # Clean cocora footer already generated — ensure it's the one we keep as landscape
    cocora = BRAND / "quote-footer-cocora.jpg"
    if cocora.exists():
        land = Image.open(cocora).convert("RGB")
        land.save(BRAND / "quote-footer-landscape.jpg", "JPEG", quality=90, optimize=True)
        print("footer landscape <- cocora", land.size)

    # Clean foliage ambiance: sample leaves from plantilla left WITHOUT logo text if possible
    # Use far-left leaves only
    leaves = im.crop((0, int(h * 0.02), int(w * 0.12), int(h * 0.15)))
    leaves = leaves.resize((400, 400), Image.Resampling.LANCZOS)
    # Soften into near-white paper so logo can sit cleanly
    paper = Image.new("RGB", leaves.size, (252, 250, 246))
    leaf_mask = Image.new("L", leaves.size, 0)
    ld = ImageDraw.Draw(leaf_mask)
    ld.ellipse((-40, -20, int(leaves.width * 0.95), int(leaves.height * 1.1)), fill=220)
    leaf_mask = leaf_mask.filter(ImageFilter.GaussianBlur(28))
    foliage = Image.composite(leaves, paper, leaf_mask)
    foliage = ImageEnhance.Brightness(foliage).enhance(1.08)
    foliage.save(BRAND / "quote-header-foliage.jpg", "JPEG", quality=90, optimize=True)
    print("foliage", foliage.size)


if __name__ == "__main__":
    main()
