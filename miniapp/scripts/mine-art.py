"""
Шахта (спрайт 96×96) з еталонного аркуша public/game/walk/ETALON DESIGN.png — у тому ж стилі, що й рибальська хата.

  python scripts/mine-art.py        → art/mine/mine.png

1. Вирізаємо з аркуша кузню («Workshops & Production», перша), купу руди й вагонетку («Miners & Extras»).
2. Складаємо їх на одне полотно (art/mine/etalon-crop.png) і переводимо в піксель гри: pixelize.py 96×96.
3. Докладаємо шахтне: штрек у дерев'яній рамі замість лівого горна, рейки до вагонетки, ліхтар.
"""
import subprocess, sys
from collections import deque
from PIL import Image

SRC = 'public/game/walk/ETALON DESIGN.png'
BG = (2, 16, 28)
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


s = cut((8, 392, 192, 608)); o = cut((1280, 935, 1368, 996)); c = cut((1426, 893, 1488, 940))
s = s.crop((0, 12, s.width, s.height - 6))  # без диму й лінії-розділювача
o = o.resize((int(o.width * 1.35), int(o.height * 1.35)), Image.LANCZOS)
P = 14; W, H = s.width + 66 + 2 * P, s.height + 14 + 2 * P
cv = Image.new('RGBA', (W, H), BG + (255,))
cv.paste(s, (P + 8, P), s)
cv.paste(o, (W - P - o.width, H - P - o.height - 6), o)
cv.paste(c, (P, H - P - c.height), c)
cv.save('art/mine/etalon-crop.png')
subprocess.run([sys.executable, 'scripts/pixelize.py', 'art/mine/etalon-crop.png', 'art/mine/base.png',
                '--size', '96x96', '--tol', '38', '--outline', '--main', '0.3'], check=True)

im=Image.open('art/mine/base.png').convert('RGBA'); p=im.load()
def s(x,y,c,a=255):
    if 0<=x<96 and 0<=y<96: p[x,y]=tuple(int(c[i:i+2],16) for i in (1,3,5))+(a,)
def rect(x,y,w,h,c):
    for i in range(x,x+w):
        for j in range(y,y+h): s(i,j,c)
K='#2b1d16'; WD={'dark':'#3f2816','lo':'#5b3a22','mid':'#8b5d3b','hi':'#b07a4c','light':'#e2bb84'}
# Темний штрек замість горна: глибина — від чорного вглиб до бурого біля рами.
X,Y,W,H=14,55,12,15
for j in range(H):
    for i in range(W):
        d=min(i,W-1-i,j)
        s(X+i,Y+j,'#0b0807' if d>=3 else '#160f0c' if d>=2 else '#22170f')
# Рама з колод: дві стійки й верхня балка з тінню.
for x0 in (X-2,X+W):
    rect(x0,Y-1,2,H+1,WD['mid']); 
    for j in range(Y-1,Y+H): s(x0,j,WD['hi']); s(x0+1,j,WD['lo'])
rect(X-3,Y-3,W+6,2,WD['mid']); 
for i in range(X-3,X+W+3): s(i,Y-3,WD['light']); s(i,Y-2,WD['lo'])
for i in range(X,X+W): s(i,Y-1,'#000000')
# Підкоси.
for k in range(3): s(X+k,Y+k,WD['lo']); s(X+W-1-k,Y+k,WD['lo'])
# Рейки: зі штреку вниз ліворуч до вагонетки.
for t in range(14):
    yy=Y+H-4+t; xa=X+2-t//2; xb=X+8-t//2
    s(xa,yy,'#717a80'); s(xb,yy,'#717a80')
    if t%3==0:
        for i in range(xa-1,xb+2): s(i,yy,WD['lo'])
        s(xa,yy,'#a9b2b7'); s(xb,yy,'#a9b2b7')
# Ліхтар на балці праворуч.
s(X+W+1,Y-1,K); rect(X+W+1,Y,2,1,'#474e54'); rect(X+W+1,Y+1,2,3,'#ffd35a'); s(X+W+1,Y+2,'#fff6c4'); rect(X+W+1,Y+4,2,1,'#474e54')
im.save('art/mine/mine.png')
