"""
Брендбук-аркуш: усі затверджені спрайти на одному полотні, в одному масштабі пікселя,
плюс палітра, витягнута з самих спрайтів, і зразки текстур землі.

Два файли в art/:
  brand-reference.png — без тексту: прикріплюй до AI-генератора як «style reference»
  brand-book.png      — те саме з підписами розділів і правилами стилю (для людей)

  pip install pillow numpy
  python scripts/gen-brand-board.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public/game"
OUT = ROOT / "art"

S = 6  # один піксель спрайта = S пікселів аркуша — для всіх розділів однаково
W = 2048
BG = (15, 42, 61)  # фон гри #0f2a3d
PANEL = (22, 56, 80)
INK = (243, 238, 226)
GOLD = (255, 207, 63)

FISH = "trout carp perch pike golden_crucian river_bream whisker_cat moon_carp coral_perch zander storm_eel sea_wanderer_tuna elder_sturgeon crystal_salmon royal_catfish sunscale_koi".split()
ITEMS = "log plank twig stone shell seaweed ice_block fish_eye fish_bone old_coin glass_shard metal_scrap silver_piece relic_ring_wanderer relic_hook_silver relic_hook_gold".split()
COINS = "old_coin coin_copper coin_bronze coin_silver coin_gold coin_jade coin_moon".split()


def load(path):
    return Image.open(path).convert("RGBA")


def up(im, k=S):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def hero_frames():
    """Мандрівник у 4 напрямках — кадри з атласу прогулянки."""
    import json

    atlas = json.loads((ROOT / "src/game/walk/atlas.json").read_text(encoding="utf-8"))
    sheet = load(PUB / "walk/sprites.png")
    out = []
    for d in ("down", "left", "up", "right"):
        f = atlas["frames"][f"hero_{d}_0"]
        out.append(sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])))
    return out


def swatches():
    """Квадрати 32×32 з текстур: трава, пісок, бруківка, скелі, вода, підлога й стіна хати."""
    ground = load(PUB / "walk/ground.png")
    water = load(PUB / "walk/water.png").crop((0, 0, 64, 64))
    home = load(PUB / "walk/home.png")
    spots = [(ground, 190, 250), (ground, 300, 302), (ground, 244, 236), (ground, 70, 250), (water, 16, 16), (home, 140, 120), (home, 10, 12)]
    out = []
    for img, x, y in spots:
        tile = Image.new("RGBA", (32, 32), (*BG, 255))
        tile.alpha_composite(img.crop((x, y, x + 32, y + 32)))
        out.append(tile)
    return out


def palette(images, n=24):
    """Головні кольори спрайтів (median cut), відсортовані за відтінком і яскравістю."""
    px = np.concatenate([np.asarray(im)[..., :3][np.asarray(im)[..., 3] > 0] for im in images])
    strip = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB")
    pal = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT).getpalette()[: n * 3]
    cols = [tuple(pal[i : i + 3]) for i in range(0, n * 3, 3)]

    def key(c):
        r, g, b = (v / 255 for v in c)
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn < 0.12:
            return (2, mx)  # сірі й темні — в кінці
        h = (g - b) / (mx - mn) % 6 if mx == r else (b - r) / (mx - mn) + 2 if mx == g else (r - g) / (mx - mn) + 4
        return (0 if h < 4.5 else 1, h, mx)

    return sorted(cols, key=key)


def grid(sprites, cols, cell_w, cell_h):
    """Спрайти в комірках однакового розміру, кожен по центру й «на підлозі» комірки."""
    rows = (len(sprites) + cols - 1) // cols
    out = Image.new("RGBA", (cols * cell_w, rows * cell_h))
    for k, im in enumerate(sprites):
        b = up(im)
        r, c = divmod(k, cols)
        out.alpha_composite(b, (c * cell_w + (cell_w - b.width) // 2, r * cell_h + (cell_h - b.height) // 2))
    return out


def board(labels):
    font = title = None
    if labels:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 26)
        title = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 34)

    buildings = [load(PUB / f"buildings/lighthouse_{i}.png") for i in range(4)]
    fish = [load(PUB / f"fish/{n}.png") for n in FISH]
    items = [load(PUB / f"items/{n}.png") for n in ITEMS if n != "old_coin"]
    coins = [load(PUB / f"items/{n}.png") for n in COINS]
    heroes = hero_frames()
    tiles = swatches()
    cols = palette(buildings + fish + items + coins)

    sections = []  # (назва, зображення)
    b = Image.new("RGBA", (W - 120 - 330, 140 * S))
    x = 0
    for im in buildings:
        u = up(im)
        b.alpha_composite(u, (x, b.height - u.height))
        x += u.width + 40
    sections.append(("Buildings — top-down 3/4, standing on their own rocky base", b, "pal"))
    sections.append(("Fish — side view, facing right", grid(fish, 8, 40 * S, 30 * S), None))
    sections.append(("Resources & relics — inventory icons", grid(items, 8, 38 * S, 32 * S), None))
    sections.append(("Coins — same rim and outline, different metals", grid(coins, 7, 40 * S, 32 * S), None))
    row = Image.new("RGBA", (W - 120, 34 * S))
    hx = 0
    for im in heroes:
        u = up(im)
        row.alpha_composite(u, (hx, row.height - u.height))
        hx += u.width + 30
    tx = hx + 80
    for t in tiles:
        u = up(t, 5)
        row.alpha_composite(u, (tx, row.height - u.height))
        tx += u.width + 24
    sections.append(("Character  ·  Terrain: grass, sand, cobble, rock, water, floor, wall", row, None))

    pad, gap, head = 60, 50, (54 if labels else 0)
    height = pad + sum(head + im.height + gap for _, im, _ in sections) + (140 if labels else 0) + pad
    canvas = Image.new("RGBA", (W, height), (*BG, 255))
    draw = ImageDraw.Draw(canvas)
    y = pad
    if labels:
        draw.text((pad, y - 10), "SVITODIY — pixel art style guide", font=title, fill=GOLD)
        draw.text(
            (pad, y + 40),
            "Crisp square pixels, no anti-aliasing · 1 px dark brown outline #2b1d16 · light from top-left · "
            "3–4 flat tones per colour, little dithering · warm cozy Ukrainian folk mood",
            font=font,
            fill=INK,
        )
        y += 140
    for name, im, extra in sections:
        if labels:
            draw.text((pad, y), name, font=font, fill=GOLD)
            y += head
        draw.rounded_rectangle((pad - 20, y - 20, W - pad + 20, y + im.height + 20), radius=14, fill=PANEL)
        canvas.alpha_composite(im, (pad, y))
        if extra == "pal":
            # Палітра праворуч від будівель: 2 стовпці квадратів.
            sx0, sz = W - pad - 290, 64
            for k, c in enumerate(cols):
                r, cc = divmod(k, 4)
                x0, y0 = sx0 + cc * (sz + 10), y + r * (sz + 10)
                draw.rectangle((x0, y0, x0 + sz, y0 + sz), fill=c, outline=(43, 29, 22), width=4)
        y += im.height + gap
    return canvas.convert("RGB")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(exist_ok=True)
    for name, labels in (("brand-reference.png", False), ("brand-book.png", True)):
        im = board(labels)
        im.save(OUT / name, optimize=True)
        print(f"{name}: {im.width}×{im.height}")


if __name__ == "__main__":
    main()
