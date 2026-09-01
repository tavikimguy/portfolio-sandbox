export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

// 'highlighter' is no longer offered in the toolbar, but stays here — the
// board already holds strokes saved under it, and they must keep rendering
// the way they were drawn.
export type DrawTool = 'marker' | 'crayon' | 'highlighter' | 'eraser';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The legacy highlighter's translucency and extra width.
export const HIGHLIGHTER_ALPHA = 0.4;
export const HIGHLIGHTER_WIDTH_SCALE = 3.5;

// Crayon lays down a fatter mark than a marker at the same nominal size.
export const CRAYON_WIDTH_SCALE = 2.4;

const GRAIN_TILE = 128;
// Below this the paper is a valley and takes no wax; the deeper below, the
// more of the stroke gets bitten away.
const GRAIN_THRESHOLD = 0.56;
const GRAIN_STRENGTH = 0.92;

/**
 * Deterministic hash in [0, 1).
 *
 * Every bit of the crayon's randomness comes through here rather than
 * Math.random(), and that is load-bearing: the in-progress stroke is redrawn
 * from scratch on every pointer move, so a random texture would crawl and
 * shimmer under the cursor and then land somewhere different again on
 * replay. Hashing position instead means the same stroke always produces
 * the same grain.
 */
function hash2(x: number, y: number, salt = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Smoothed lattice noise that tiles seamlessly across GRAIN_TILE. */
function valueNoise(x: number, y: number, cells: number, salt: number) {
  const s = GRAIN_TILE / cells;
  const gx = Math.floor(x / s);
  const gy = Math.floor(y / s);
  const fx = x / s - gx;
  const fy = y / s - gy;
  const wrap = (i: number) => ((i % cells) + cells) % cells;
  const h = (ix: number, iy: number) => hash2(wrap(ix), wrap(iy), salt);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(gx, gy);
  const b = h(gx + 1, gy);
  const c = h(gx, gy + 1);
  const d = h(gx + 1, gy + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

let grainTile: HTMLCanvasElement | null = null;
const patternCache = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/**
 * A tiling paper-tooth mask, built once and reused. Black with a varying
 * alpha — only the alpha matters, because it is used with destination-out to
 * eat holes in a stroke that has already been laid down.
 */
function getGrainPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  const cached = patternCache.get(ctx);
  if (cached) return cached;

  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = GRAIN_TILE;
    grainTile.height = GRAIN_TILE;
    const tctx = grainTile.getContext('2d')!;
    const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE);

    for (let y = 0; y < GRAIN_TILE; y++) {
      for (let x = 0; x < GRAIN_TILE; x++) {
        // Coarse clumps read as the tooth of the paper, the fine octave and
        // the speckle as crumbled wax.
        const n =
          0.32 * valueNoise(x, y, 8, 1) +
          0.36 * valueNoise(x, y, 26, 2) +
          0.32 * hash2(x, y, 3);
        const cut = n < GRAIN_THRESHOLD ? (GRAIN_THRESHOLD - n) / GRAIN_THRESHOLD : 0;
        img.data[(y * GRAIN_TILE + x) * 4 + 3] = Math.round(
          Math.min(1, cut * 1.6) * 255 * GRAIN_STRENGTH
        );
      }
    }
    tctx.putImageData(img, 0, 0);
  }

  const pattern = ctx.createPattern(grainTile, 'repeat')!;
  patternCache.set(ctx, pattern);
  return pattern;
}

/**
 * Trace a point list as ONE continuous path, smoothing the corners.
 *
 * Every consecutive pair gets a quadratic curve through the raw sample with
 * the segment midpoints as endpoints. That removes the faceting you get from
 * straight lineTo hops without moving the stroke off the points you actually
 * drew, and it is deterministic — the same points always produce the same
 * curve, which is what lets the live stroke and the committed stroke match.
 */
function tracePath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);

  if (points.length === 2) {
    ctx.lineTo(points[1][0], points[1][1]);
    return;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function strokeOrDot(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  tracePath(ctx, points);
  ctx.stroke();
}

// Two jittered outriders WIDER than the core, then the core on top. Keeping
// the wobbly passes outside the solid one is what breaks the silhouette — an
// earlier version had them inside, and the core just drew a clean capsule
// edge back over the top of them. Widest first, densest last.
const CRAYON_PASSES = [
  { width: 1.10, alpha: 0.34, jitter: 0.30, salt: 11 },
  { width: 0.92, alpha: 0.52, jitter: 0.16, salt: 29 },
  { width: 0.70, alpha: 0.95, jitter: 0, salt: 0 },
];

// How far past the nominal half-width a crayon stroke can actually reach:
// the widest pass, plus that pass's jitter. strokeBounds has to pad by this
// or the outriders land outside the box that gets cleared and composited,
// and the leftovers stay stuck on the live layer.
const CRAYON_HALF_EXTENT = 1.10 / 2 + 0.30 / 2;

function renderCrayon(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  width: number,
  bounds: Bounds
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const pass of CRAYON_PASSES) {
    const amp = width * pass.jitter;
    const pts: [number, number][] =
      amp === 0
        ? points
        : points.map(([x, y]) => [
            x + (hash2(x, y, pass.salt) - 0.5) * amp,
            y + (hash2(y, x, pass.salt + 1) - 0.5) * amp,
          ]);

    ctx.globalAlpha = pass.alpha;
    ctx.lineWidth = Math.max(1, width * pass.width);
    strokeOrDot(ctx, pts);
  }

  // Bite the paper texture out of what was just laid down. This only ever
  // touches the layer the stroke is on, never the committed board.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = getGrainPattern(ctx);
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Render one whole stroke onto a layer.
 *
 * Marker and highlighter go down opaque: their translucency belongs to the
 * composite step (compositeStroke below), because applying it here would
 * compound the alpha wherever the path crosses itself. The crayon is the
 * exception — its whole look is built from deliberately layered passes, so
 * it manages its own alpha and arrives pre-textured.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  tool: DrawTool,
  color: string,
  brushSize: number,
  bounds: Bounds
) {
  if (points.length === 0) return;

  const width = strokeWidth(tool, brushSize);
  // Black stands in for the eraser: only its alpha is ever used, when the
  // layer is composited with destination-out.
  const paint = tool === 'eraser' ? '#000000' : color;

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (tool === 'crayon') {
    renderCrayon(ctx, points, paint, width, bounds);
    ctx.globalAlpha = 1;
    return;
  }

  ctx.strokeStyle = paint;
  ctx.fillStyle = paint;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = tool === 'highlighter' ? 'butt' : 'round';
  strokeOrDot(ctx, points);
}

export function strokeWidth(tool: DrawTool, brushSize: number) {
  if (tool === 'highlighter') return brushSize * HIGHLIGHTER_WIDTH_SCALE;
  if (tool === 'crayon') return brushSize * CRAYON_WIDTH_SCALE;
  return brushSize;
}

/**
 * Flatten a rendered stroke layer down onto the committed canvas.
 *
 * `rect` limits the work to the stroke's bounding box — without it every
 * commit would push all 25M pixels of the board through the compositor.
 */
export function compositeStroke(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  tool: DrawTool,
  rect: Bounds
) {
  if (rect.width <= 0 || rect.height <= 0) return;

  if (tool === 'eraser') {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
  } else if (tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
  } else {
    // Marker and crayon both arrive carrying the alpha they should keep.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.drawImage(
    layer,
    rect.x, rect.y, rect.width, rect.height,
    rect.x, rect.y, rect.width, rect.height
  );

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Bounding box of a stroke, padded to cover the brush width and the
 * anti-aliased fringe just outside it, then clamped to the canvas.
 */
export function strokeBounds(
  points: [number, number][],
  tool: DrawTool,
  brushSize: number,
  canvasWidth: number,
  canvasHeight: number
): Bounds {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = points[0][0], maxX = points[0][0];
  let minY = points[0][1], maxY = points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const halfExtent = tool === 'crayon' ? CRAYON_HALF_EXTENT : 0.5;
  const pad = strokeWidth(tool, brushSize) * halfExtent + 2;
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(canvasWidth, Math.ceil(maxX + pad));
  const bottom = Math.min(canvasHeight, Math.ceil(maxY + pad));

  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * Get canvas position from a pointer event, accounting for zoom.
 *
 * No separate pan offset here on purpose: `canvas` lives inside the
 * pan-and-zoom-transformed board container, so getBoundingClientRect()
 * already reflects the current pan — subtracting it again would double
 * count it (invisible while pan was always (0,0), but breaks as soon as
 * you've actually panned/scrolled the board).
 */
export function getCanvasCoordinates(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
  zoom: number = 1
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / zoom;
  const y = (e.clientY - rect.top) / zoom;
  return [x, y];
}

/**
 * Detect if point is inside bounding box
 */
export function isPointInBounds(
  x: number,
  y: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number
): boolean {
  return x >= boxX && x <= boxX + boxWidth && y >= boxY && y <= boxY + boxHeight;
}
