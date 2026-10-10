"""
Нарізає AI-згенерований піксель-арт аркуш (сітка cols×rows) на окремі спрайти
справжнього «рідного» розміру.

AI малює «фальшиві» пікселі: розмиті блоки ~7–9 px, не на рівній сітці. Простий resize
дає кашу, тож для кожної клітинки:
  0. суцільний фон (пурпуровий тощо) робимо прозорим, а пурпурову облямівку на краях перефарбовуємо;
  1. прибираємо напівпрозоре сміття від вирізання фону (alpha < 128) й ділимо аркуш на плями —
     кожна належить клітинці, де її центр (риба може вилазити за межі своєї клітинки);
  2. шукаємо період і зсув піксельної сітки за піками горизонтальних/вертикальних перепадів;
  3. з кожного блоку беремо медіанний колір його центру → 1 справжній піксель;
  4. викидаємо острівці з 1–2 пікселів (ореоли), обрізаємо по вмісту.

  pip install pillow numpy
  python scripts/cut-sheet.py art/fish-sheet.png 4 4 public/game/fish trout carp perch ...
Імена — по рядках зліва направо; «-» пропускає клітинку.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def fit_period(profile, lo=5.0, hi=11.0):
    """Період і зсув сітки: де піки перепадів найкраще лягають на k·s + o."""
    n = len(profile)
    base = profile.mean() + 1e-6
    best = (0.0, 8.0, 0.0)
    for s in np.arange(lo, hi, 0.05):
        for o in np.arange(0, s, 0.25):
            pos = np.arange(o, n - 1, s)
            idx = np.clip(np.round(pos).astype(int), 0, n - 1)
            score = profile[idx].mean() / base
            if score > best[0]:
                best = (score, s, o)
    return best[1], best[2]


def edges(rgb, alpha, axis):
    """Сила перепадів між сусідніми стовпцями (axis=1) чи рядками (axis=0)."""
    lum = rgb @ np.array([0.3, 0.59, 0.11]) + alpha * 0.5
    d = np.abs(np.diff(lum, axis=axis))
    return d.sum(axis=1 - axis)


def drop_specks(opaque, min_size=3):
    h, w = opaque.shape
    seen = np.zeros_like(opaque, bool)
    for y in range(h):
        for x in range(w):
            if not opaque[y, x] or seen[y, x]:
                continue
            comp, q = [], deque([(y, x)])
            seen[y, x] = True
            while q:
                cy, cx = q.popleft()
                comp.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and opaque[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) < min_size:
                for cy, cx in comp:
                    opaque[cy, cx] = False


def key_background(a):
    """Суцільний фон (напр. пурпуровий #ff00ff) → прозорість, разом із пурпуровою облямівкою по краях."""
    if a[..., 3].min() < 255:
        return  # фон уже прозорий
    corners = np.concatenate([a[:6, :6, :3].reshape(-1, 3), a[:6, -6:, :3].reshape(-1, 3), a[-6:, :6, :3].reshape(-1, 3), a[-6:, -6:, :3].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    rgb = a[..., :3]
    far = np.linalg.norm(rgb - bg, axis=2)
    key = far < 110
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if bg[0] > 180 and bg[2] > 180 and bg[1] < 80:
        # Пурпуровий фон: усе дуже «пурпурове» (червоний і синій сильно над зеленим) — теж фон.
        key |= (np.minimum(r, b) - g > 95) & (np.abs(r - b) < 90)
    a[key, 3] = 0
    return True


def despill(out, passes=3):
    """
    Пурпурові пікселі на краю спрайта (злиття з фоном: рожеві, фіолетові) → колір сусідів;
    без «чистих» сусідів — прозорі. Кілька проходів, щоб обдерти облямівку шар за шаром.
    Темні контури з легким пурпуровим відтінком не чіпаємо.
    """
    for _ in range(passes):
        rgb = out[..., :3].astype(int)
        opaque = out[..., 3] > 0
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        tinted = opaque & (rgb.max(axis=2) > 90) & (r - g > 12) & (b - g > 25)
        # Жовте сяйво, змішане з пурпуровим фоном, дає теплий рожевий.
        tinted |= opaque & (r > 220) & (r - g > 60) & (b >= g - 5) & (b > 140)
        pad = np.pad(opaque, 1)
        edge = opaque & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        todo = list(zip(*np.nonzero(tinted & edge)))
        if not todo:
            return
        for y, x in todo:
            ys, xs = slice(max(0, y - 1), y + 2), slice(max(0, x - 1), x + 2)
            ok = opaque[ys, xs] & ~tinted[ys, xs]
            if ok.any():
                out[y, x, :3] = np.median(rgb[ys, xs][ok], axis=0)
            else:
                out[y, x] = 0


def components(mask):
    """Зв'язні плями маски: список масивів індексів (y, x)."""
    h, w = mask.shape
    label = np.zeros(mask.shape, np.int32)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if label[y0, x0]:
            continue
        n = len(out) + 1
        label[y0, x0] = n
        q, pts = deque([(y0, x0)]), []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    q.append((ny, nx))
        out.append(np.array(pts))
    return out


def prepare(a, solid):
    """Вміст однієї клітинки (лише її плями), обрізаний по непрозорому з невеликим полем."""
    ys, xs = np.nonzero(solid)
    pad = 4
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
    rgb, solid = a[y0:y1, x0:x1, :3], solid[y0:y1, x0:x1]
    return rgb, np.where(solid, 255.0, 0.0), solid


def cut_cell(prep, period, keyed=False):
    """period — спільний для аркуша розмір «пікселя»; тут шукаємо лише зсув сітки."""
    rgb, alpha, solid = prep
    sx, ox = fit_period(edges(rgb, alpha, 1), period, period + 0.01)
    sy, oy = fit_period(edges(rgb, alpha, 0), period, period + 0.01)
    h, w = solid.shape
    # Межі блоків: перший блок починається з -s+o, щоб не загубити край.
    xb = np.arange(ox - sx, w + sx, sx)
    yb = np.arange(oy - sy, h + sy, sy)
    out = np.zeros((len(yb) - 1, len(xb) - 1, 4), np.uint8)
    for j in range(len(yb) - 1):
        for i in range(len(xb) - 1):
            # Центральна половина блоку — без розмитих країв.
            cy0, cy1 = yb[j] + sy * 0.25, yb[j + 1] - sy * 0.25
            cx0, cx1 = xb[i] + sx * 0.25, xb[i + 1] - sx * 0.25
            ry = slice(max(0, int(np.floor(cy0))), max(0, int(np.ceil(cy1))))
            rx = slice(max(0, int(np.floor(cx0))), max(0, int(np.ceil(cx1))))
            m = solid[ry, rx]
            if m.size == 0 or m.mean() < 0.5:
                continue
            out[j, i, :3] = np.median(rgb[ry, rx][m], axis=0)
            out[j, i, 3] = 255
    if keyed:
        despill(out)
    opaque = out[..., 3] > 0
    drop_specks(opaque)
    out[~opaque] = 0
    ys, xs = np.nonzero(opaque)
    out = out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    return Image.fromarray(out, "RGBA"), (sx, sy)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    src, cols, rows, outdir, *names = sys.argv[1:]
    cols, rows = int(cols), int(rows)
    a = np.asarray(Image.open(src).convert("RGBA"), dtype=np.float64).copy()
    keyed = bool(key_background(a))
    cw, ch = a.shape[1] / cols, a.shape[0] / rows
    # Риба з сусідньої колонки може заходити в чужу клітинку — тож ділимо не ножицями по сітці,
    # а цілими плямами: кожна належить клітинці, де її центр.
    groups = {}
    for pts in components(a[..., 3] >= 128):
        cy, cx = pts.mean(axis=0)
        groups.setdefault(int(cy // ch) * cols + int(cx // cw), []).append(pts)
    cells = {}
    for k, name in enumerate(names):
        if name == "-":
            continue
        if k not in groups:
            print(f"{name}: порожня клітинка")
            continue
        solid = np.zeros(a.shape[:2], bool)
        for pts in groups[k]:
            solid[pts[:, 0], pts[:, 1]] = True
        cells[name] = prepare(a, solid)
    # AI тримає один розмір «пікселя» на весь аркуш, а окремі клітинки інколи хибно ловлять кратні періоди —
    # беремо медіану по всіх напрямках і клітинках.
    periods = [fit_period(edges(rgb, a, ax))[0] for rgb, a, _ in cells.values() for ax in (0, 1)]
    period = float(np.median(periods))
    print(f"розмір пікселя: {period:.2f}")
    for name, prep in cells.items():
        img, _ = cut_cell(prep, period, keyed)
        img.save(f"{outdir}/{name}.png", optimize=True)
        print(f"{name}: {img.width}×{img.height}")


if __name__ == "__main__":
    main()
