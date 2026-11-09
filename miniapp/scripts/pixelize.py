"""
Перетворює картинку з локального Stable Diffusion (або будь-який «піксель-арт» від AI)
на справжній спрайт гри: рівна сітка, точний розмір, палітра гри, контур і тінь як у
згенерованих кодом спрайтах (scripts/gen-island-art.mjs).

AI малює «фальшиві» пікселі — блоки по ~8 px з розмитими краями й сотнями відтінків.
Тому:
  1. фон (колір кутів) заливкою від країв робимо прозорим;
  2. обрізаємо по вмісту й вписуємо в цільовий розмір W×H (пропорції зберігаємо, якір — низ по центру);
  3. кожен цільовий піксель = медіанний колір центру свого блоку (не середнє — без каші);
     прозорий, якщо блок здебільшого фон;
  4. кольори прив'язуємо до палітри гри (усі кольори атласу sprites.png), у просторі Lab;
  5. прибираємо острівці з 1–2 пікселів, додаємо темний контур і, за бажанням, тінь.

  python scripts/pixelize.py in.png out.png --size 54x64 [--outline] [--shadow] [--colors 24]

Готовий PNG клади в public/game/buildings/<ім'я_кадру>.png — генератор атласу підхопить
його замість намальованого кодом (функція handmade()). Потім: npm run gen:island.
"""
import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / 'public/game/walk/sprites.png'
OUTLINE = (0x2B, 0x1D, 0x16)  # C.K у генераторі
SHADOW = (0x0B, 0x20, 0x10)


def srgb_to_lab(rgb):
    """sRGB 0..255 → CIE Lab (D65): відстань у Lab ближча до того, як бачить око."""
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def game_palette():
    """Усі непрозорі кольори атласу гри — палітра, якої тримаються спрайти."""
    a = np.asarray(Image.open(ATLAS).convert('RGBA'))
    px = a[a[..., 3] == 255][:, :3]
    return np.unique(px, axis=0).astype(np.float64)


def remove_background(rgb, tol):
    """
    Заливка від країв: усе, що схоже на колір кутів і з'єднане з краєм, — фон.
    М'яку сіру тінь, яку модель кладе під предмет, теж вважаємо фоном: вона безбарвна
    й світла, тож допуск для таких пікселів більший (тінь гра малює сама).
    """
    h, w, _ = rgb.shape
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]], np.float64)
    bg = np.median(corners, axis=0)
    f = rgb.astype(np.float64)
    dist = np.linalg.norm(f - bg, axis=-1)
    sat = f.max(-1) - f.min(-1)
    close = (dist < tol) | ((sat < 18) & (f.mean(-1) > 120) & (dist < tol * 3))
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return ~seen  # True — об'єкт


def fit_period(profile, lo=5.0, hi=12.0):
    """Період і зсув «піксельної» сітки AI: де піки перепадів найкраще лягають на k·s + o."""
    n = len(profile)
    base = profile.mean() + 1e-6
    best = (0.0, 8.0, 0.0)
    for s in np.arange(lo, hi, 0.05):
        for o in np.arange(0, s, 0.25):
            idx = np.clip(np.round(np.arange(o, n - 1, s)).astype(int), 0, n - 1)
            score = profile[idx].mean() / base
            if score > best[0]:
                best = (score, s, o)
    return best[1], best[2]


def native_grid(rgb, mask):
    """
    Відновити справжні пікселі AI-арту: знайти сітку за перепадами яскравості
    (як scripts/cut-sheet.py) і взяти з кожної клітинки медіану її центру.
    Повертає (rgb, mask) у «рідній» роздільності малюнка.
    """
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgb[y0:y1, x0:x1].astype(np.float64)
    m = mask[y0:y1, x0:x1]
    lum = crop @ np.array([0.3, 0.59, 0.11]) + m * 80
    sx, ox = fit_period(np.abs(np.diff(lum, axis=1)).sum(0))
    sy, oy = fit_period(np.abs(np.diff(lum, axis=0)).sum(1))
    s = (sx + sy) / 2  # квадратні пікселі
    nx = int((crop.shape[1] - ox) // s)
    ny = int((crop.shape[0] - oy) // s)
    out = np.zeros((ny, nx, 3), np.uint8)
    om = np.zeros((ny, nx), bool)
    for j in range(ny):
        for i in range(nx):
            cx0 = int(ox + 1 + (i + 0.25) * s)
            cx1 = max(int(ox + 1 + (i + 0.75) * s), cx0 + 1)
            cy0 = int(oy + 1 + (j + 0.25) * s)
            cy1 = max(int(oy + 1 + (j + 0.75) * s), cy0 + 1)
            mm = m[cy0:cy1, cx0:cx1]
            if mm.size and mm.mean() >= 0.5:
                out[j, i] = np.median(crop[cy0:cy1, cx0:cx1][mm], axis=0)
                om[j, i] = True
    print(f'сітка AI: {s:.2f} px на піксель → {nx}×{ny}')
    return out, om


def downsample(rgb, mask, tw, th, fill):
    """Вписати вміст у tw×th: кожен піксель — медіана центру свого блоку."""
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cw, ch = x1 - x0, y1 - y0
    k = max(cw / tw, ch / th, 1.0)  # скільки px джерела на піксель спрайта (не збільшуємо)
    ow, oh = max(1, round(cw / k)), max(1, round(ch / k))
    out = np.zeros((th, tw, 4), np.uint8)
    ox = (tw - ow) // 2  # по центру
    oy = th - oh  # якір — низ
    for j in range(oh):
        for i in range(ow):
            sx0, sx1 = x0 + i * k, x0 + (i + 1) * k
            sy0, sy1 = y0 + j * k, y0 + (j + 1) * k
            # Центральна половина блоку: краї блоків у AI-арту розмиті.
            # Блок завжди ≥ 1 px (за k ≈ 1 інакше бувають порожні зрізи → чорні смуги).
            cx0 = min(int(sx0 + (sx1 - sx0) * 0.25), mask.shape[1] - 1)
            cy0 = min(int(sy0 + (sy1 - sy0) * 0.25), mask.shape[0] - 1)
            cx1 = max(int(sx0 + (sx1 - sx0) * 0.75), cx0 + 1)
            cy1 = max(int(sy0 + (sy1 - sy0) * 0.75), cy0 + 1)
            m = mask[cy0:cy1, cx0:cx1]
            if not m.size or m.mean() < fill:
                continue
            c = rgb[cy0:cy1, cx0:cx1][m]
            out[oy + j, ox + i, :3] = np.median(c, axis=0)
            out[oy + j, ox + i, 3] = 255
    return out


def snap_palette(img, palette, colors):
    """Прив'язати до палітри гри; colors — скільки найвживаніших кольорів лишити."""
    opaque = img[..., 3] == 255
    px = img[opaque][:, :3].astype(np.float64)
    pal_lab = srgb_to_lab(palette)
    idx = np.argmin(((srgb_to_lab(px)[:, None, :] - pal_lab[None]) ** 2).sum(-1), axis=1)
    if colors and len(np.unique(idx)) > colors:
        used, counts = np.unique(idx, return_counts=True)
        keep = used[np.argsort(-counts)[:colors]]
        sub = pal_lab[keep]
        idx = keep[np.argmin(((srgb_to_lab(px)[:, None, :] - sub[None]) ** 2).sum(-1), axis=1)]
    img[opaque, :3] = palette[idx].astype(np.uint8)
    return img


def drop_specks(img, min_size=3):
    """Прибрати острівці з 1–2 пікселів (ореоли від вирізання фону)."""
    a = img[..., 3] > 0
    h, w = a.shape
    seen = np.zeros_like(a)
    for y in range(h):
        for x in range(w):
            if not a[y, x] or seen[y, x]:
                continue
            comp, q = [], deque([(y, x)])
            seen[y, x] = True
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) < min_size:
                for cy, cx in comp:
                    img[cy, cx, 3] = 0
    return img


def add_outline(img):
    """Зовнішній контур 1 px — як Img.outline() у генераторі."""
    a = img[..., 3] > 128
    n = np.zeros_like(a)
    n[1:] |= a[:-1]
    n[:-1] |= a[1:]
    n[:, 1:] |= a[:, :-1]
    n[:, :-1] |= a[:, 1:]
    ring = n & ~a
    img[ring, :3] = OUTLINE
    img[ring, 3] = 255
    return img


def add_shadow(img):
    """Напівпрозора еліпс-тінь під предметом, під пікселями спрайта (як shadow())."""
    h, w = img.shape[:2]
    a = img[..., 3] > 0
    cols = np.nonzero(a.any(0))[0]
    cx, rx = (cols.min() + cols.max() + 1) / 2, (cols.max() - cols.min() + 1) / 2
    cy, ry = h - 2.5, max(1.5, h * 0.05)
    yy, xx = np.mgrid[0:h, 0:w]
    inside = (((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1) & ~a
    img[inside, :3] = SHADOW
    img[inside, 3] = round(0.28 * 255)
    return img


def keep_main(mask, share):
    """
    Лишити головний предмет: модель часом домальовує поруч дрібні зайві речі (тумбочки біля шафи).
    Зберігаємо зв'язні шматки (8-сусідство), не менші за share від найбільшого.
    """
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        n = len(sizes)
        label[y0, x0] = n
        q = deque([(y0, x0)])
        size = 0
        while q:
            y, x = q.popleft()
            size += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = n
                        q.append((ny, nx))
        sizes.append(size)
    big = max(sizes)
    keep = np.array([s >= big * share and s > 0 for s in sizes])
    return keep[label] & mask


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # консоль Windows інакше падає на кирилиці
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src')
    p.add_argument('dst')
    p.add_argument('--size', required=True, help='WxH спрайта, напр. 54x64')
    p.add_argument('--tol', type=float, default=40, help='допуск кольору фону (0..441)')
    p.add_argument('--fill', type=float, default=0.5, help='частка блоку, щоб піксель був непрозорим')
    p.add_argument('--colors', type=int, default=0, help='максимум кольорів (0 — без обмеження; обмеження з'"'"'їдає рідкісні яскраві акценти)')
    p.add_argument('--grid', action='store_true', help='спершу знайти «піксельну» сітку AI (≈8 px на піксель)')
    p.add_argument('--outline', action='store_true')
    p.add_argument('--shadow', action='store_true')
    p.add_argument('--main', type=float, default=0, help='лишити лише головний предмет: шматки ≥ цієї частки найбільшого (напр. 0.3)')
    p.add_argument('--preview', type=int, default=0, help='ще й прев\'ю ×N поруч (…-xN.png)')
    a = p.parse_args()
    tw, th = map(int, a.size.lower().split('x'))
    # Під контур і тінь лишаємо по пікселю з боків і два знизу.
    pad_x, pad_y = (1, 2) if a.outline else (0, 0)
    src = np.asarray(Image.open(a.src).convert('RGB'))
    mask = remove_background(src, a.tol)
    if a.main:
        mask = keep_main(mask, a.main)
    if a.grid:
        # Спершу — у рідну сітку AI; далі вписуємо так само, як і будь-яку картинку.
        src, mask = native_grid(src, mask)
    img = downsample(src, mask, tw - 2 * pad_x, th - pad_y - (1 if a.outline else 0), a.fill)
    full = np.zeros((th, tw, 4), np.uint8)
    full[1 if a.outline else 0 : th - pad_y, pad_x : tw - pad_x] = img
    full = snap_palette(full, game_palette(), a.colors)
    full = drop_specks(full)
    if a.outline:
        full = add_outline(full)
    if a.shadow:
        full = add_shadow(full)
    Image.fromarray(full, 'RGBA').save(a.dst)
    if a.preview:
        out = Path(a.dst)
        Image.fromarray(full, 'RGBA').resize((tw * a.preview, th * a.preview), Image.NEAREST).save(out.with_name(f'{out.stem}-x{a.preview}.png'))
    print(f'{a.dst}: {tw}×{th}, кольорів {len(np.unique(full[full[..., 3] == 255][:, :3], axis=0))}')


if __name__ == '__main__':
    main()
