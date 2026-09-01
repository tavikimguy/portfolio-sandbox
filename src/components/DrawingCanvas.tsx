import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore, type Annotation } from '@/stores/canvas';
import {
  renderStroke,
  compositeStroke,
  strokeBounds,
  getCanvasCoordinates,
  type DrawTool,
} from '@/lib/drawing';
import { nanoid } from 'nanoid';

// Custom per-tool cursor icons, tip roughly at the icon's business end.
// Eraser has no static icon — it gets a live-sized circular outline instead.
// A missing image makes the browser fall through to the keyword after it, so
// dropping a crayon.png into public/cursors is enough to give it its own.
const TOOL_CURSORS: Partial<Record<string, string>> = {
  marker: "url('/cursors/marker.png') 4 30, crosshair",
  crayon: "url('/cursors/crayon.png') 4 28, crosshair",
};

// Samples closer together than this (in board units) are pointer noise
// rather than intent. Dropping them keeps a slow, careful stroke from
// coming out furry, and it happens at capture time so the points that get
// drawn are exactly the points that get stored.
const MIN_POINT_DISTANCE = 1.2;

const DRAW_TOOLS = new Set(['marker', 'crayon', 'eraser']);


interface DrawingCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
}

export function DrawingCanvas({
  canvasWidth,
  canvasHeight,
  zoom,
}: DrawingCanvasProps) {
  // Two layers on purpose. `canvasRef` holds committed strokes and is never
  // touched mid-stroke. `liveCanvasRef` holds ONLY the stroke in progress,
  // redrawn whole on every move and flattened down once on release.
  //
  // That split is the fix for the stroke visibly changing at the moment you
  // lift. The old code painted each point-pair straight onto the committed
  // canvas, then re-rendered the finished stroke as one path — two different
  // algorithms producing two different results, swapped under your hand.
  // Now the live pixels and the committed pixels come from the same call.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<[number, number][]>([]);
  const strokeToolRef = useRef<DrawTool>('marker');
  const strokeColorRef = useRef('#000000');
  const strokeSizeRef = useRef(3);

  // What the committed canvas currently shows, plus the id of the stroke we
  // just flattened onto it ourselves. Together these let the replay effect
  // tell "the user finished a stroke that is already painted" (skip) from
  // "history moved — undo, redo, or a server load" (repaint).
  const renderedRef = useRef<Annotation[]>([]);
  const justCommittedIdRef = useRef<string | null>(null);

  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);

  const {
    activeTool,
    penColor,
    brushSize,
    eraserSize,
    setEraserSize,
    setIsDrawing,
    addAnnotation,
    annotations,
  } = useCanvasStore();

  // Repaint the committed canvas from history — but only when history
  // actually moved. Repainting a stroke that is already on screen is what
  // produced the jump at pointerup.
  useEffect(() => {
    const canvas = canvasRef.current;
    const live = liveCanvasRef.current;
    if (!canvas || !live) return;

    const ctx = canvas.getContext('2d');
    const liveCtx = live.getContext('2d');
    if (!ctx || !liveCtx) return;

    const prev = renderedRef.current;

    // The annotation poll refetches every 5 seconds and hands React a brand
    // new array, which used to force a full repaint of the whole board even
    // though the contents were identical. Cheap to detect, and skipping it
    // removes a periodic hitch that got much worse once crayon strokes —
    // three passes and a pattern fill each — started showing up in replays.
    if (
      annotations.length === prev.length &&
      annotations.every((a, i) => a.id === prev[i].id)
    ) {
      renderedRef.current = annotations;
      return;
    }

    const isOwnCommit =
      justCommittedIdRef.current !== null &&
      annotations.length === prev.length + 1 &&
      annotations[annotations.length - 1]?.id === justCommittedIdRef.current &&
      prev.every((a, i) => a === annotations[i]);

    // Consume it either way: a later redo produces the same id, and that one
    // really does need a repaint.
    justCommittedIdRef.current = null;

    if (isOwnCommit) {
      renderedRef.current = annotations;
      return;
    }

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Replay runs every stroke through the same render-then-composite pair
    // the live path uses, so an undo/redo cannot shift a stroke either.
    annotations.forEach((annotation) => {
      if (annotation.type !== 'drawing') return;
      const tool = (annotation.tool ?? 'marker') as DrawTool;
      const bounds = strokeBounds(
        annotation.points,
        tool,
        annotation.brushSize,
        canvasWidth,
        canvasHeight
      );
      if (bounds.width <= 0 || bounds.height <= 0) return;

      liveCtx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
      renderStroke(liveCtx, annotation.points, tool, annotation.color, annotation.brushSize, bounds);
      compositeStroke(ctx, live, tool, bounds);
      liveCtx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    });

    renderedRef.current = annotations;
  }, [annotations, canvasWidth, canvasHeight]);

  // [ / ] resize the eraser, Photoshop-style — but not while a code
  // window's editor (or any other text field) has focus.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTool !== 'eraser') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

      if (e.key === '[') setEraserSize(eraserSize - 4);
      else if (e.key === ']') setEraserSize(eraserSize + 4);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, eraserSize, setEraserSize]);

  // Redraw the whole in-progress stroke onto the live layer. Clearing the
  // current bounds first is enough to wipe the previous frame, because a
  // stroke only ever grows — this frame's box always contains the last one.
  //
  // This is deliberately a FULL redraw, not an incremental one. Clipping the
  // repaint to just the changed tail is roughly twice as fast and was tried,
  // but it made the live stroke diverge from the same stroke re-rendered by
  // replay (~9% of ink pixels, in the crayon's grain). Exactness between what
  // you see while drawing and what you get afterwards is the whole point of
  // this two-layer design, so the speed is not worth it.
  const paintLiveStroke = useCallback(() => {
    const live = liveCanvasRef.current;
    const committed = canvasRef.current;
    if (!live || !committed) return;

    const liveCtx = live.getContext('2d');
    if (!liveCtx) return;

    const points = currentPointsRef.current;
    const tool = strokeToolRef.current;
    const bounds = strokeBounds(points, tool, strokeSizeRef.current, canvasWidth, canvasHeight);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    liveCtx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    renderStroke(liveCtx, points, tool, strokeColorRef.current, strokeSizeRef.current, bounds);

    // The eraser is the one tool whose preview cannot be pure CSS — there is
    // no blend mode that subtracts a layer from the one below it. So it gets
    // flattened onto the committed canvas every frame instead. Re-erasing an
    // already-erased region is a no-op, so repeating this is safe; only the
    // sub-pixel anti-aliased rim erodes slightly faster live than on replay.
    if (tool === 'eraser') {
      const ctx = committed.getContext('2d');
      if (ctx) compositeStroke(ctx, live, 'eraser', bounds);
    }
  }, [canvasWidth, canvasHeight]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!DRAW_TOOLS.has(activeTool)) return;

      // Keep receiving moves even when the pointer leaves the board or the
      // window. Without this a stroke silently stops at the edge. It throws
      // if the pointer is already gone by the time we get here, which must
      // not take the whole stroke down with it — capture is an improvement,
      // not a requirement.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }

      const tool = activeTool as DrawTool;
      isDrawingRef.current = true;
      setIsDrawing(true);

      // Freeze the tool settings for the whole stroke, so changing a colour
      // or size mid-drag cannot restyle the part already drawn.
      strokeToolRef.current = tool;
      strokeColorRef.current = penColor;
      strokeSizeRef.current = tool === 'eraser' ? eraserSize : brushSize;

      const [x, y] = getCanvasCoordinates(e.nativeEvent, e.currentTarget, zoom);
      currentPointsRef.current = [[x, y]];
      paintLiveStroke();
    },
    [activeTool, penColor, brushSize, eraserSize, setIsDrawing, zoom, paintLiveStroke]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (activeTool === 'eraser') {
        setEraserCursor({ x: e.clientX, y: e.clientY });
      }

      if (!isDrawingRef.current) return;

      const live = liveCanvasRef.current;
      if (!live) return;

      // Coalesced events fill in the sub-frame samples the browser batched
      // up between the last dispatched move and this one — without them, a
      // fast stroke only gets the endpoints of that gap, so the curve cuts
      // corners the pointer actually went around.
      const rawEvents = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const events = rawEvents.length > 0 ? rawEvents : [e.nativeEvent];

      const points = currentPointsRef.current;
      for (const rawEvent of events) {
        const [x, y] = getCanvasCoordinates(rawEvent, live, zoom);
        const last = points[points.length - 1];
        if (last) {
          const dx = x - last[0];
          const dy = y - last[1];
          if (dx * dx + dy * dy < MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) continue;
        }
        points.push([x, y]);
      }

      // Once per dispatched move, not once per sample — repainting the
      // stroke is the expensive half, and the browser only shows us one
      // frame anyway.
      paintLiveStroke();
    },
    [activeTool, zoom, paintLiveStroke]
  );

  const finishStroke = useCallback(() => {
    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;
    setIsDrawing(false);

    const live = liveCanvasRef.current;
    const committed = canvasRef.current;
    const points = currentPointsRef.current;
    currentPointsRef.current = [];

    if (!live || !committed || points.length === 0) return;

    const liveCtx = live.getContext('2d');
    const ctx = committed.getContext('2d');
    if (!liveCtx || !ctx) return;

    const tool = strokeToolRef.current;
    const bounds = strokeBounds(points, tool, strokeSizeRef.current, canvasWidth, canvasHeight);

    // The eraser already flattened itself down on every frame; everything
    // else flattens exactly once, here. Either way the committed canvas now
    // holds the same pixels the live layer was showing, so clearing the live
    // layer changes nothing on screen. That is the whole point: no visible
    // handover, no correction.
    if (tool !== 'eraser') {
      compositeStroke(ctx, live, tool, bounds);
    }
    liveCtx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);

    const id = nanoid();
    justCommittedIdRef.current = id;
    addAnnotation({
      id,
      type: 'drawing',
      points,
      color: strokeColorRef.current,
      brushSize: strokeSizeRef.current,
      timestamp: Date.now(),
      tool,
    });
  }, [addAnnotation, setIsDrawing, canvasWidth, canvasHeight]);

  useEffect(() => {
    document.addEventListener('pointerup', finishStroke);
    document.addEventListener('pointercancel', finishStroke);
    return () => {
      document.removeEventListener('pointerup', finishStroke);
      document.removeEventListener('pointercancel', finishStroke);
    };
  }, [finishStroke]);

  const isDrawTool = DRAW_TOOLS.has(activeTool);

  return (
    <>
      {/* `isolation: isolate` matters. The live layer previews the
          highlighter with mix-blend-mode, and without an isolated stacking
          context that would blend against the cards below too — while the
          committed composite only ever blends against committed ink. The
          preview would then differ from the result, which is the exact bug
          class this refactor exists to remove. */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 50, isolation: 'isolate', pointerEvents: 'none' }}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
        />

        <canvas
          ref={liveCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerLeave={() => setEraserCursor(null)}
          className="absolute inset-0"
          style={{
            cursor: activeTool === 'eraser' ? 'none' : TOOL_CURSORS[activeTool] ?? 'default',
            // Both selectable ink tools composite with plain source-over at
            // full alpha, so the preview needs no blend trickery to match.
            opacity: 1,
            mixBlendMode: 'normal',
            // Only capture pointer events while a drawing tool is selected —
            // otherwise this full-board overlay blocks clicks/drags on cards
            // underneath it.
            pointerEvents: isDrawTool ? 'auto' : 'none',
          }}
        />
      </div>

      {/* Photoshop-style eraser outline: a live circle, sized to exactly
          what the next stroke will erase, following the real cursor.
          Portaled to <body> — this canvas lives inside the pan/zoom-
          transformed board container, and CSS makes any ancestor with a
          `transform` the containing block for position:fixed descendants,
          not the viewport. Left in place, the "fixed" math above resolves
          against that transformed ancestor instead — the circle drifts and
          scales with pan/zoom rather than tracking the real cursor. */}
      {activeTool === 'eraser' &&
        eraserCursor &&
        createPortal(
          <div
            className="fixed rounded-full pointer-events-none"
            style={{
              left: eraserCursor.x,
              top: eraserCursor.y,
              width: eraserSize * zoom,
              height: eraserSize * zoom,
              transform: 'translate(-50%, -50%)',
              border: '1.5px solid rgba(0,0,0,0.85)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.85)',
              zIndex: 400,
            }}
          />,
          document.body
        )}
    </>
  );
}
