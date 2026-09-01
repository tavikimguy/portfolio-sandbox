"""WFOC logo object -> transparent duotone sprite sheet.

The mark's black fills are topologically continuous with its ground, so no
colour or connectivity key can separate them (verified: the ground measures
72% of the frame at every threshold from 60 to 200). The silhouette is
therefore built from the WHITE features: dilate them until they merge into
one blob, fill the enclosed holes — which is what recaptures the mark's own
black fills — then erode back.

Dilation is scale-sensitive: at full crop resolution the white features are
far enough apart that the same growth swallows the whole frame. So this runs
at the 560px working size where the geometry was tuned.
"""

import glob
import os
import subprocess
from PIL import Image, ImageDraw, ImageFilter

SRC = '/Users/kavi/Downloads/portfolio-sandbox/public/assets/shared/wfoc-logo-animation.mp4'
OUT = '/Users/kavi/Downloads/portfolio-sandbox/public/assets/wfoc/logo-object-sprite.webp'
CHECK = '/private/tmp/claude-501/-Users-kavi/174b199f-bc7a-42ea-bfaf-2c1bbf574591/scratchpad'
TMP = '/tmp/wfoc_small'

CROP = 'crop=920:942:500:76'
WORK_W = 560          # geometry below is tuned at this width
FPS = 12
COLS, ROWS = 10, 5
CELL_W, CELL_H = 320, 328

ORANGE = (255, 96, 64)   # #ff6040, from the project's own palette slide
INK = (20, 20, 20)
WHITE_THRESH = 110
GROW, PASSES = 9, 4


def silhouette(im):
    mask = im.convert('L').point(lambda v: 255 if v > WHITE_THRESH else 0)
    for _ in range(PASSES):
        mask = mask.filter(ImageFilter.MaxFilter(GROW))

    flood = mask.copy()
    w, h = flood.size
    px = flood.load()
    seeds = 0
    for x in range(0, w, 2):
        for y in (0, h - 1):
            if px[x, y] == 0:
                ImageDraw.floodfill(flood, (x, y), 64, thresh=10)
                seeds += 1
    for y in range(0, h, 2):
        for x in (0, w - 1):
            if px[x, y] == 0:
                ImageDraw.floodfill(flood, (x, y), 64, thresh=10)
                seeds += 1
    if seeds == 0:
        # The dilated blob reached every border pixel, so there is no outside
        # to flood and the mask would come back fully opaque. Better to know.
        raise SystemExit('silhouette failed: dilated mask touches the whole border')

    filled = flood.point(lambda v: 0 if v == 64 else 255)
    for _ in range(PASSES):
        filled = filled.filter(ImageFilter.MinFilter(GROW))
    return filled


def duotone(im, alpha):
    lum = im.convert('L')
    px = []
    for l, a in zip(lum.getdata(), alpha.getdata()):
        if a < 128:
            px.append((0, 0, 0, 0))
        elif l > 128:
            px.append((*ORANGE, 255))
        else:
            px.append((*INK, 255))
    out = Image.new('RGBA', im.size)
    out.putdata(px)
    return out


os.makedirs(TMP, exist_ok=True)
for f in glob.glob(f'{TMP}/*.png'):
    os.remove(f)
subprocess.run(
    ['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-vf', f'{CROP},fps={FPS},scale={WORK_W}:-2', f'{TMP}/f%03d.png'],
    check=True,
)
frames = sorted(glob.glob(f'{TMP}/f*.png'))
assert len(frames) <= COLS * ROWS, f'{len(frames)} frames exceed a {COLS}x{ROWS} sheet'

sheet = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
coverage = []
for i, path in enumerate(frames):
    im = Image.open(path).convert('RGB')
    a = silhouette(im)
    coverage.append(sum(1 for v in a.getdata() if v > 128) / (a.size[0] * a.size[1]))
    cell = duotone(im, a).resize((CELL_W, CELL_H), Image.LANCZOS)
    sheet.paste(cell, ((i % COLS) * CELL_W, (i // COLS) * CELL_H))
    if i in (0, 17, 34):
        Image.alpha_composite(Image.new('RGBA', cell.size, (255, 255, 255, 255)), cell).convert('RGB').save(
            f'{CHECK}/final_cell{i}.png'
        )

sheet.save(OUT, 'WEBP', quality=92, method=6)
alpha = sheet.getchannel('A')
clear = sum(1 for v in alpha.getdata() if v == 0) / (sheet.size[0] * sheet.size[1])
print(f'{len(frames)} frames -> {COLS}x{ROWS} sheet {sheet.size[0]}x{sheet.size[1]}, {os.path.getsize(OUT)/1000:.0f} kB')
print(f'silhouette coverage per frame: min {min(coverage):.0%} max {max(coverage):.0%}')
print(f'sheet fully transparent: {clear:.0%}, alpha levels {len(set(alpha.getdata()))}')
