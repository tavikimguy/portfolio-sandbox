import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { clampBoxToBoard, clampPan, clampZoom } from '@/lib/canvas-bounds';

// Default starter content — inspired by browserbase.com's hero, which
// (checked directly against the live site, not guessed) turns out to be a
// <canvas> that stays fully transparent at rest and only paints while the
// cursor is over it, fading back out over ~500ms after it leaves — a real
// "etch trail" that reveals a second video along the cursor's path. No
// video assets here (that's their asset to serve, not ours to copy), but
// the same mechanism: a dim, always-visible pixel-mountain base, and a
// trail of vivid pixels that follows the cursor and decays over time.
const DEFAULT_CODE_WINDOW_HTML = `<canvas id="scene"></canvas>`;
const DEFAULT_CODE_WINDOW_CSS = `html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #0c1622;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}`;
const DEFAULT_CODE_WINDOW_JS = `const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
resize();
window.addEventListener('resize', resize);

const PIXEL = 10;
// Two distinct palettes, not one palette faded up/down — the real hero
// reveals a *different* video's frames along the trail, so what's actually
// changing is which pixels are showing, not just how bright they are.
const BASE_PALETTE = ['#16283f', '#1b2f47', '#0c1622', '#1b2f47'];
const REVEAL_PALETTE = ['#ff5722', '#c6ff00', '#ff8a50', '#0a0a0a'];
const TRAIL_FADE_MS = 650; // roughly matches how fast the real hero fades

// A jagged skyline from a few layered sine waves, not a real heightmap.
function mountainHeight(col, cols) {
  const t = col / cols;
  return 0.35
    + 0.25 * Math.sin(t * 8)
    + 0.15 * Math.sin(t * 23 + 2)
    + 0.10 * Math.sin(t * 51 + 1);
}

// Cheap deterministic "random" so the same pixel always picks the same
// color instead of flickering every frame.
function pseudoRandom(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// Recent cursor samples, each timestamped so old ones can fade and drop
// out — this is the actual "trail": not a fixed cursor position, but a
// short history of where it's been.
let trail = [];
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  trail.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() });
  if (trail.length > 40) trail.shift();
});

function draw(now) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  trail = trail.filter((p) => now - p.t < TRAIL_FADE_MS);

  const cols = Math.ceil(w / PIXEL);
  const rows = Math.ceil(h / PIXEL);

  for (let cx = 0; cx < cols; cx++) {
    const topRow = Math.floor(rows * (1 - mountainHeight(cx, cols)));
    for (let cy = topRow; cy < rows; cy++) {
      const px = cx * PIXEL;
      const py = cy * PIXEL;

      // How close is this pixel to the nearest *recent* trail point, and
      // how fresh is that point? Both fold into how vivid the pixel gets.
      let influence = 0;
      for (const p of trail) {
        const dx = px - p.x, dy = py - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const fresh = 1 - (now - p.t) / TRAIL_FADE_MS;
        const near = Math.max(0, 1 - dist / 60);
        influence = Math.max(influence, near * fresh);
      }

      // Which pixel is actually showing swaps from the dim base palette to
      // the vivid reveal palette as the trail passes over — a color
      // change, not just an opacity ramp on the same pixel.
      const revealed = influence > 0.5;
      const palette = revealed ? REVEAL_PALETTE : BASE_PALETTE;
      const seed = revealed ? cx * 7 + cy * 13 : cx;
      const colorIndex = Math.floor(pseudoRandom(seed, cy) * palette.length);
      ctx.fillStyle = palette[colorIndex];
      ctx.globalAlpha = revealed ? 0.5 + influence * 0.5 : 0.35;
      ctx.fillRect(px, py, PIXEL, PIXEL);
    }
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);`;

export interface Comment {
  id: string;
  type: 'comment';
  text: string;
  x: number;
  y: number;
  color: string;
  timestamp: number;
}

export interface Drawing {
  id: string;
  type: 'drawing';
  points: Array<[number, number]>;
  color: string;
  brushSize: number;
  timestamp: number;
  // 'highlighter' is retired from the toolbar but still stored on older
  // strokes, which must keep rendering the way they were drawn.
  tool?: 'marker' | 'crayon' | 'highlighter' | 'eraser';
}

export type Annotation = Comment | Drawing;

export interface CardTransform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

// A user-droppable CodePen-style window: editable HTML/CSS/JS on one side,
// a live sandboxed iframe preview on the other. Positioned/sized/rotated
// like a portfolio Card, but user-created rather than fixed content.
export interface CodeWindow {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  html: string;
  css: string;
  js: string;
}

interface CanvasState {
  // Pan/zoom — lives here (not component state) so anything can drive it,
  // including a code window forwarding a wheel event that landed inside
  // its iframe via postMessage, not just Canvas.tsx's own native listener.
  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;

  // Annotations (global, shared)
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;

  // Card transforms (per-session)
  cardTransforms: Map<string, CardTransform>;
  updateCardTransform: (id: string, transform: Partial<CardTransform>) => void;
  resetCardTransforms: () => void;

  // Code windows (per-session, user-created)
  codeWindows: CodeWindow[];
  addCodeWindow: (x: number, y: number) => void;
  updateCodeWindow: (id: string, patch: Partial<CodeWindow>) => void;
  removeCodeWindow: (id: string) => void;

  // UI state
  selectedCardId: string | null;
  setSelectedCardId: (id: string | null) => void;

  // Cards currently showing their expanded content — any number at once.
  // Canvas.tsx pushes every card apart whenever one of these toggles so
  // nothing ends up overlapping.
  expandedCardIds: Set<string>;
  toggleExpandedCard: (id: string) => void;

  selectedCodeWindowId: string | null;
  setSelectedCodeWindowId: (id: string | null) => void;

  isDrawing: boolean;
  setIsDrawing: (drawing: boolean) => void;

  activeTool: 'pointer' | 'marker' | 'crayon' | 'eraser' | 'comment' | 'code';
  setActiveTool: (tool: 'pointer' | 'marker' | 'crayon' | 'eraser' | 'comment' | 'code') => void;

  penColor: string;
  setPenColor: (color: string) => void;

  brushSize: number;
  setBrushSize: (size: number) => void;

  // Eraser gets its own continuously-adjustable size, independent of
  // marker/highlighter's fixed thin/thick presets.
  eraserSize: number;
  setEraserSize: (size: number) => void;

  // Undo/Redo
  history: Annotation[][];
  historyIndex: number;
  pushHistory: (annotations: Annotation[]) => void;
  undo: () => void;
  redo: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  subscribeWithSelector((set, get) => ({
    // Pan/zoom — clamped here, at the single choke point every caller
    // (native wheel, a code window's forwarded wheel, anything future)
    // goes through, so nothing needs to remember to clamp itself.
    zoom: 1,
    setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
    pan: { x: 0, y: 0 },
    setPan: (pan) => set({ pan: clampPan(pan.x, pan.y, get().zoom) }),

    // Annotations
    annotations: [],
    setAnnotations: (annotations) => set({ annotations }),
    addAnnotation: (annotation) => {
      const current = get().annotations;
      const updated = [...current, annotation];
      set({ annotations: updated });
      get().pushHistory(updated);
    },
    removeAnnotation: (id) => {
      const current = get().annotations;
      const updated = current.filter((a) => a.id !== id);
      set({ annotations: updated });
      get().pushHistory(updated);
    },

    // Card transforms
    cardTransforms: new Map(),
    updateCardTransform: (id, transform) => {
      const current = get().cardTransforms;
      const merged = { ...current.get(id), ...transform } as CardTransform;
      // The dotted grid is the board's hard edge — clamp here, at the one
      // place every drag/resize call funnels through, so nothing can ever
      // end up positioned (or dragged) outside it in the first place.
      const { x, y } = clampBoxToBoard(merged.x, merged.y, merged.width, merged.height);
      const updated = new Map(current);
      updated.set(id, { ...merged, x, y });
      set({ cardTransforms: updated });
    },
    resetCardTransforms: () => set({ cardTransforms: new Map() }),

    // Code windows
    codeWindows: [],
    addCodeWindow: (x, y) => {
      const current = get().codeWindows;
      const width = 480;
      const height = 340;
      // Center the new window on the click point rather than anchoring
      // its top-left corner there, then clamp so placing one near the
      // board's edge can't itself push it outside the grid.
      const { x: cx, y: cy } = clampBoxToBoard(x - width / 2, y - height / 2, width, height);
      const newWindow: CodeWindow = {
        id: nanoid(),
        x: cx,
        y: cy,
        width,
        height,
        rotation: 0,
        zIndex: current.length + 10,
        html: DEFAULT_CODE_WINDOW_HTML,
        css: DEFAULT_CODE_WINDOW_CSS,
        js: DEFAULT_CODE_WINDOW_JS,
      };
      set({ codeWindows: [...current, newWindow] });
    },
    updateCodeWindow: (id, patch) => {
      const current = get().codeWindows;
      set({
        codeWindows: current.map((w) => {
          if (w.id !== id) return w;
          const merged = { ...w, ...patch };
          const { x, y } = clampBoxToBoard(merged.x, merged.y, merged.width, merged.height);
          return { ...merged, x, y };
        }),
      });
    },
    removeCodeWindow: (id) => {
      const current = get().codeWindows;
      set({ codeWindows: current.filter((w) => w.id !== id) });
    },

    // UI state
    selectedCardId: null,
    setSelectedCardId: (id) => set({ selectedCardId: id }),

    expandedCardIds: new Set(),
    toggleExpandedCard: (id) => {
      const next = new Set(get().expandedCardIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      set({ expandedCardIds: next });
    },

    selectedCodeWindowId: null,
    setSelectedCodeWindowId: (id) => set({ selectedCodeWindowId: id }),

    isDrawing: false,
    setIsDrawing: (drawing) => set({ isDrawing: drawing }),

    activeTool: 'pointer',
    setActiveTool: (tool) => set({ activeTool: tool }),

    penColor: '#000000',
    setPenColor: (color) => set({ penColor: color }),

    brushSize: 3,
    setBrushSize: (size) => set({ brushSize: size }),

    eraserSize: 24,
    setEraserSize: (size) => set({ eraserSize: Math.max(8, Math.min(120, size)) }),

    // Undo/Redo
    history: [[]],
    historyIndex: 0,
    pushHistory: (annotations) => {
      const { history, historyIndex } = get();
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(annotations);
      set({ history: newHistory, historyIndex: newHistory.length - 1 });
    },
    undo: () => {
      const { historyIndex, history } = get();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        set({
          historyIndex: newIndex,
          annotations: history[newIndex],
        });
      }
    },
    redo: () => {
      const { historyIndex, history } = get();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        set({
          historyIndex: newIndex,
          annotations: history[newIndex],
        });
      }
    },
  }))
);
