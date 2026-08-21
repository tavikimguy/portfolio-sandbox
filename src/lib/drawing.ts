import { getStroke } from 'perfect-freehand';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

/**
 * Convert pressure-aware points to smooth SVG path
 */
export function generateSmoothPath(points: Point[]): string {
  if (points.length < 2) return '';

  const stroke = getStroke(
    points.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
    {
      size: 4,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      easing: (t) => t,
      last: true,
    }
  );

  if (stroke.length === 0) return '';

  let pathData = `M ${stroke[0][0]} ${stroke[0][1]} Q`;

  for (let i = 1; i < stroke.length; i++) {
    const [x, y] = stroke[i];
    pathData += ` ${x} ${y}`;
  }

  return pathData;
}

/**
 * Marker - a bold, solid, uniform-width stroke.
 */
export function drawPathOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  brushSize: number
) {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = brushSize;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'source-over';

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);

  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    ctx.lineTo(x, y);
  }

  ctx.stroke();
}

/**
 * Highlighter - a wide, translucent, flat-capped stroke. Uses 'multiply'
 * blending so overlapping strokes (and ink drawn before it) darken
 * naturally instead of just stacking flat opacity, like a real highlighter.
 */
export function drawHighlighterStroke(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  brushSize: number
) {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = brushSize * 3.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4;

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Eraser - uses destination-out to remove pixels
 */
export function erasePath(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  brushSize: number
) {
  if (points.length < 2) return;

  ctx.lineWidth = brushSize;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'destination-out';

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);

  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Get canvas position from a mouse event, accounting for zoom.
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
