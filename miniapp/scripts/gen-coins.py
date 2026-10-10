"""
Монети з різних металів — у стилі «Старої монети» (public/game/items/old_coin.png):
той самий розмір, темний контур, опуклий бортик із перлинками, світло зверху-зліва,
а посередині — вибитий рельєфом малюнок (риба, вітрильник, профіль, корона, сонце, місяць).
Поки ніде в грі не використовуються.

  pip install pillow numpy
  python scripts/gen-coins.py            → public/game/items/coin_*.png
  python scripts/gen-coins.py --preview <файл.png>
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public/game/items"
S = 24  # розмір спрайта, як у old_coin
OUTLINE = (43, 29, 22)

# Рельєфи (≤ 12×11, «#» — опукла частина, «.» — поле).
FISH = [
    "....##......",
    "..######..#.",
    ".########.##",
    "##.#########",
    ".########.##",
    "..######..#.",
    "....##......",
]
SHIP = [
    ".....#.....",
    ".....##....",
    ".....###...",
    ".....####..",
    "....#.####.",
    "...##.#....",
    "..###.#....",
    "###########",
    ".#########.",
    "..#######..",
]
PROFILE = [
    "...####...",
    "..######..",
    ".########.",
    ".#########",
    "##.#######",
    "##########",
    ".#########",
    "..#######.",
    "...#####..",
    "...####...",
    "..######..",
]
CROWN = [
    "#....#....#",
    "##..###..##",
    "###.###.###",
    "###########",
    "#.##.#.##.#",
    "###########",
    ".#########.",
]
SUN = [
    ".....#.....",
    ".#...#...#.",
    "..#.###.#..",
    "...#####...",
    "..#######..",
    "####.#.####",
    "..#######..",
    "...#####...",
    "..#.###.#..",
    ".#...#...#.",
    ".....#.....",
]
MOON = [
    "...####..#.",
    "..###.....",
    ".###....#.",
    ".###.....#",
    ".###......",
    ".####...#.",
    "..#####...",
    "...####...",
]

# Метал, рельєф, перлинки, прикраси.
COINS = [
    dict(id="coin_copper", ramp=["#4a2414", "#7a3e1e", "#a85a2a", "#d07a3a", "#f3a866"], art=FISH, beads=0),
    dict(id="coin_bronze", ramp=["#33240f", "#5e4320", "#86652f", "#b08a45", "#d9b56e"], art=SHIP, beads=8, patina=True),
    dict(id="coin_silver", ramp=["#2a303b", "#565f6d", "#8a94a2", "#c2cad4", "#f4f7fb"], art=PROFILE, beads=12, shine=True),
    dict(id="coin_gold", ramp=["#4a2c06", "#8a5a0e", "#c88c18", "#f2bf38", "#fff2a6"], art=CROWN, beads=16, shine=True),
    dict(id="coin_jade", ramp=["#0c3526", "#1c6446", "#2f9563", "#62c98d", "#c4f5d6"], art=SUN, beads=16, shine=True, sparkle=1),
    dict(id="coin_moon", ramp=["#24103a", "#4b2370", "#7c45ab", "#b07fdb", "#ead2ff"], art=MOON, beads=12, shine=True, sparkle=2),
]


def hexrgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def coin(spec):
    ramp = [hexrgb(c) for c in spec["ramp"]]
    img = np.zeros((S, S, 4), np.uint8)

    def put(x, y, col):
        if 0 <= x < S and 0 <= y < S:
            img[y, x] = (*col, 255)

    for y in range(S):
        for x in range(S):
            dx, dy = x + 0.5 - 12, y + 0.5 - 12
            r = math.hypot(dx, dy)
            if r > 11.35:
                continue
            nx, ny = (dx / r, dy / r) if r else (0, 0)
            lit = -(nx + ny) * 0.707  # +1 зверху-зліва, -1 знизу-справа
            if r > 10.4:
                put(x, y, OUTLINE)
            elif r > 9.6:
                # Зовнішній край бортика: відблиск згори-зліва, тінь знизу-справа.
                put(x, y, ramp[4] if lit > 0.35 else ramp[1] if lit < -0.35 else ramp[3])
            elif r > 8.0:
                put(x, y, ramp[3] if lit > -0.2 else ramp[2])
            elif r > 7.0:
                # Жолобок: внутрішній бік бортика — світло знизу-справа.
                put(x, y, ramp[0] if lit > 0 else ramp[2])
            else:
                put(x, y, ramp[3] if (dx + dy) < -7.5 else ramp[2])

    # Перлинки на бортику: світла цятка з тінню знизу-справа.
    for k in range(spec["beads"]):
        a = 2 * math.pi * k / spec["beads"] - math.pi / 2
        bx, by = math.floor(12 + math.cos(a) * 8.8), math.floor(12 + math.sin(a) * 8.8)
        put(bx + 1, by + 1, ramp[1])
        put(bx, by, ramp[4])

    # Рельєф: тінь знизу-справа від форми, тіло, світлий верхньо-лівий край.
    art = spec["art"]
    h, w = len(art), len(art[0])
    x0, y0 = 12 - (w + 1) // 2, 12 - (h + 1) // 2
    cells = {(x0 + cx, y0 + cy) for cy, row in enumerate(art) for cx, c in enumerate(row) if c == "#"}
    for x, y in cells:
        if (x + 1, y + 1) not in cells:
            put(x + 1, y + 1, ramp[0])
    for x, y in cells:
        edge = (x - 1, y) not in cells or (x, y - 1) not in cells
        put(x, y, ramp[4] if edge else ramp[3])

    if spec.get("patina"):
        for x, y in [(6, 15), (7, 16), (16, 6), (17, 7), (15, 17), (5, 8)]:
            put(x, y, (98, 128, 84))
    if spec.get("shine"):
        for x, y in [(6, 4), (5, 5), (4, 6)]:
            put(x, y, (255, 255, 255))

    out = Image.fromarray(img, "RGBA")
    n = spec.get("sparkle", 0)
    if n:
        # Іскорки найцінніших — у полі 3 px праворуч і зверху.
        big = Image.new("RGBA", (S + 3, S + 3))
        big.alpha_composite(out, (0, 3))
        a = np.array(big)
        for sx, sy in [(24, 2), (2, 22)][:n]:
            for dx, dy in [(0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)]:
                a[sy + dy, sx + dx] = (255, 255, 255, 255) if (dx, dy) == (0, 0) else (*ramp[4], 255)
        out = Image.fromarray(a, "RGBA")
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    imgs = {c["id"]: coin(c) for c in COINS}
    if "--preview" in sys.argv:
        dst = sys.argv[sys.argv.index("--preview") + 1]
        k = 12
        row = [Image.open(OUT / "old_coin.png").convert("RGBA"), *imgs.values()]
        sheet = Image.new("RGBA", (sum((i.width + 4) * k for i in row), 30 * k), (212, 192, 146, 255))
        x = 0
        for im in row:
            b = im.resize((im.width * k, im.height * k), Image.NEAREST)
            sheet.alpha_composite(b, (x + 2 * k, (30 * k - b.height) // 2))
            x += (im.width + 4) * k
        sheet.save(dst)
        print(f"прев'ю → {dst}")
        return
    for cid, im in imgs.items():
        im.save(OUT / f"{cid}.png", optimize=True)
        print(f"{cid}: {im.width}×{im.height}")


if __name__ == "__main__":
    main()
