"""
Приймальна скриня конвеєра (спрайт 24×22) з еталонного аркуша public/game/walk/ETALON DESIGN.png.

  python scripts/belt-art.py        → art/belt/crate.png

1. Вирізаємо відкриту скриню з «Miners & Extras» (art/belt/etalon-crop.png) і переводимо в піксель гри: pixelize.py.
2. Замість золота згори — риба й камінці (те, що привозить конвеєр), спереду — жолоб, куди заїжджає стрічка.
Самі стрічки й речі на них малює рушій (walk/belts.js) — у тих самих барвах, що й ряд «Conveyor belts (wooden)».
"""
import subprocess, sys
from collections import deque
from pathlib import Path
from PIL import Image

SRC = 'public/game/walk/ETALON DESIGN.png'
BG = (2, 16, 28)
Path('art/belt').mkdir(parents=True, exist_ok=True)
sheet = Image.open(SRC).convert('RGB')


def cut(box, tol=34):
    """Шматок аркуша без фону: заливка від країв по темно-синьому."""
    c = sheet.crop(box); w, h = c.size; px = c.load()
    out = Image.new('RGBA', (w, h)); o = out.load()
    bg = [[False] * h for _ in range(w)]
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or bg[x][y]: continue
        if sum((a - b) ** 2 for a, b in zip(px[x, y], BG)) >= tol * tol: continue
        bg[x][y] = True; q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    for x in range(w):
        for y in range(h):
            if not bg[x][y]: o[x, y] = px[x, y] + (255,)
    return out.crop(out.getbbox())


c = cut((1088, 945, 1150, 1006))
P = 6
cv = Image.new('RGBA', (c.width + 2 * P, c.height + 2 * P), BG + (255,))
cv.paste(c, (P, P), c)
cv.save('art/belt/etalon-crop.png')
W, H = 24, 22
subprocess.run([sys.executable, 'scripts/pixelize.py', 'art/belt/etalon-crop.png', 'art/belt/base.png',
                '--size', f'{W}x{H}', '--tol', '38', '--outline', '--main', '0.3'], check=True)

im = Image.open('art/belt/base.png').convert('RGBA'); p = im.load()


def s(x, y, col):
    if 0 <= x < W and 0 <= y < H: p[x, y] = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


# Верхній ряд, де було золото: шукаємо перший рядок дощок згори і кладемо на нього улов.
top = next(y for y in range(H) if any(p[x, y][3] for x in range(W)))
K = '#2b1d16'
# Риба (срібна, з темною спинкою) — дві, навскоси.
for (fx, fy, body, back) in ((6, top + 2, '#c9d6de', '#5d7d96'), (12, top + 1, '#e8885a', '#a3341f')):
    for i in range(5):
        s(fx + i, fy, back); s(fx + i, fy + 1, body)
    s(fx - 1, fy, K); s(fx - 1, fy + 1, K); s(fx + 5, fy - 1, back); s(fx + 5, fy + 2, back)  # хвіст
    s(fx + 1, fy, '#ffffff')  # око
# Камінці праворуч.
for (x, y, col) in ((17, top + 2, '#8d9296'), (18, top + 2, '#b5b9bb'), (19, top + 3, '#6b7074'), (16, top + 3, '#a2a6a8')):
    s(x, y, col)
im.save('art/belt/crate.png')
print('art/belt/crate.png', im.size)
