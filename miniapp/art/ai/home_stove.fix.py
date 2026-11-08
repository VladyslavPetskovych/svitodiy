"""Ручне доопрацювання AI-печі #2: прибрати ручки/ніжки, повернути припічок, намалювати петриківку."""
import importlib.util, sys
import numpy as np
from PIL import Image
G, OUT = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('pix', 'scripts/pixelize.py'); pix = importlib.util.module_from_spec(spec); spec.loader.exec_module(pix)
img = np.array(Image.open(G + '/stove-hclean-1.png').convert('RGBA'))
H, W = img.shape[:2]
hexc = lambda h: [int(h[i:i + 2], 16) for i in (1, 3, 5)] + [255]
# 1. Знести старий контур і тінь — перемалюємо наприкінці.
K = np.array([0x2B, 0x1D, 0x16])
img[(np.abs(img[..., :3].astype(int) - K).sum(-1) < 30) & (img[..., 3] == 255)] = 0
img[img[..., 3] < 255] = 0
# 2. Ручки й цятки → тиньк: кожен стовпчик бере свій колір із рядка 27 (там стіна чиста).
for y in range(29, 53):
    for x in range(28, 50):
        img[y, x] = img[27, x]
# Цятки ліворуч від чела.
for y in range(29, 42):
    for x in range(2, 8):
        img[y, x] = img[27, x]
# 3. Низ: усе нижче 52 — геть; натомість побілений припічок і кам'яний цоколь, як у старої печі.
img[52:] = 0
left, right = 1, 52
for x in range(left, right + 1):
    for y in range(52, 56):
        img[y, x] = hexc('#f6f0e2' if y == 52 else '#e6dbc4' if x < right - 2 else '#d9ccb2')
    for y in range(56, 59):
        img[y, x] = hexc('#8f887c' if y == 56 else '#6f675c')
# Чело печі сидить на припічку: тінь під аркою.
for x in range(9, 26):
    img[52, x] = hexc('#b8ac94')
# 4. Петриківка: квітуча гілка на білій стіні праворуч від чела.
PAL = {'g': '#3f7d27', 'l': '#74bb44', 'r': '#c8372d', 'R': '#7e1f1a', 'y': '#ffd23c', 'o': '#e8892d', 'b': '#2f6fd0', 'B': '#6fb2ef'}
MOTIF = [
    '......rrr.......',
    '.....rRyRr......',
    '....rRyyyRr.....',
    '.....rRyRr......',
    '..ll..rgr..ll...',
    '.lgl...g...lgl..',
    '..l...gg....l...',
    '......g...bb....',
    '..yy..g..bBBb...',
    '.yoy..g..bByb...',
    '..yy..g...bb....',
    '......gg..g.....',
    '...l...g.g......',
    '..lgl..gg..ll...',
    '...l...g..lgl...',
    '..b....g...l..r.',
    '.bBb...g.....rRr',
    '..b...ggg.....r.',
    '.....g...g......',
]
ox, oy = 31, 30
for j, row in enumerate(MOTIF):
    for i, ch in enumerate(row):
        if ch in PAL:
            img[oy + j, ox + i] = hexc(PAL[ch])
# 5. Контур і тінь — тими самими функціями, що й у pixelize.py.
img = pix.drop_specks(img)
img = pix.add_outline(img)
img = pix.add_shadow(img)
Image.fromarray(img, 'RGBA').save(OUT)
print('ok', OUT)
