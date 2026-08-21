import { CANVAS_WIDTH, CANVAS_HEIGHT } from './portfolio-cards';

// Shared by Canvas.tsx (native wheel events) and CodeWindow.tsx (wheel
// events forwarded via postMessage from inside an iframe) so both paths
// use the exact same math — pan/zoom needs to work identically whether
// the cursor is over the open board or over a code window's preview.

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

export function clampZoom(zoomValue: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomValue));
}

// The dotted grid IS the board's edge — panning can never reveal space
// beyond [0, CANVAS_WIDTH] x [0, CANVAS_HEIGHT]. This only holds because
// card/code-window positions are themselves clamped to that same
// rectangle (see clampBoxToBoard below) — otherwise content dragged past
// the edge would become unreachable, which is exactly why this used to be
// a dynamic, content-following rectangle. Now that content can't leave
// the grid in the first place, the simple fixed-rectangle clamp is
// correct again.
export function clampPan(x: number, y: number, zoomValue: number) {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  const boardW = CANVAS_WIDTH * zoomValue;
  const boardH = CANVAS_HEIGHT * zoomValue;

  const minX = Math.min(0, viewportW - boardW);
  const maxX = Math.max(0, viewportW - boardW);
  const minY = Math.min(0, viewportH - boardH);
  const maxY = Math.max(0, viewportH - boardH);

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

// Keeps whatever board point is under the cursor visually fixed while the
// zoom level changes, instead of always expanding from the top-left
// corner. clientX/clientY must already be in page (viewport) coordinates
// — callers forwarding events from inside an iframe need to add the
// iframe's own bounding-rect offset first.
export function computeZoomStep(
  currentZoom: number,
  currentPan: { x: number; y: number },
  clientX: number,
  clientY: number,
  deltaY: number
) {
  // How much zoom changes per unit of wheel delta. Trackpad Ctrl+scroll
  // and pinch gestures report small deltas per frame (a handful of units),
  // so this needs to be aggressive enough that a normal gesture reaches a
  // noticeable zoom change within a second, not a slow crawl.
  const ZOOM_SENSITIVITY = 0.012;
  const zoomFactor = Math.exp(-deltaY * ZOOM_SENSITIVITY);
  const newZoom = clampZoom(currentZoom * zoomFactor);

  const newPan = {
    x: clientX - (clientX - currentPan.x) * (newZoom / currentZoom),
    y: clientY - (clientY - currentPan.y) * (newZoom / currentZoom),
  };

  return { zoom: newZoom, pan: clampPan(newPan.x, newPan.y, newZoom) };
}

// Keeps a card or code window's full (unrotated) bounding box inside the
// board rectangle — this is what actually makes the grid a hard edge:
// nothing clamps pan by itself if content can still be dragged past it,
// so this runs at the single choke point (the store's update actions)
// that every drag/resize call goes through.
export function clampBoxToBoard(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(0, CANVAS_WIDTH - width);
  const maxY = Math.max(0, CANVAS_HEIGHT - height);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}
