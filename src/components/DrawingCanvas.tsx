import React, { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCanvasStore } from '@/stores/canvas';
import { drawPathOnCanvas, drawHighlighterStroke, erasePath, getCanvasCoordinates } from '@/lib/drawing';
import { nanoid } from 'nanoid';

// Custom per-tool cursor icons, tip roughly at the icon's business end.
// Eraser has no static icon — it gets a live-sized circular outline instead.
const TOOL_CURSORS: Partial<Record<string, string>> = {
  marker: "url('/cursors/marker.png') 4 30, crosshair",
  highlighter: "url('/cursors/highlighter.png') 4 28, crosshair",
};

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<[number, number][]>([]);
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

  // Render all existing drawings on canvas mount and when annotations change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Redraw all existing drawings, in order, so erasers correctly punch
    // through strokes drawn before them
    annotations.forEach((annotation) => {
      if (annotation.type === 'drawing') {
        if (annotation.tool === 'eraser') {
          erasePath(ctx, annotation.points, annotation.brushSize);
        } else if (annotation.tool === 'highlighter') {
          drawHighlighterStroke(ctx, annotation.points, annotation.color, annotation.brushSize);
        } else {
          ctx.globalCompositeOperation = 'source-over';
          drawPathOnCanvas(ctx, annotation.points, annotation.color, annotation.brushSize);
        }
      }
    });
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (activeTool === 'pointer' || activeTool === 'comment') return;

      isDrawingRef.current = true;
      setIsDrawing(true);
      currentPointsRef.current = [];

      const [x, y] = getCanvasCoordinates(e.nativeEvent, canvasRef.current!, zoom);
      currentPointsRef.current.push([x, y]);
    },
    [activeTool, setIsDrawing, zoom]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (activeTool === 'eraser') {
        setEraserCursor({ x: e.clientX, y: e.clientY });
      }

      if (!isDrawingRef.current || activeTool === 'pointer' || activeTool === 'comment') return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Coalesced events fill in the sub-frame samples the browser batched
      // up between the last dispatched move and this one — without them, a
      // fast stroke only gets the endpoints of that gap, so consecutive
      // segments can visibly skip texture/leave the eraser feeling like it
      // missed spots, especially at speed.
      const rawEvents = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const events = rawEvents.length > 0 ? rawEvents : [e.nativeEvent];

      for (const rawEvent of events) {
        const [x, y] = getCanvasCoordinates(rawEvent, canvas, zoom);
        currentPointsRef.current.push([x, y]);

        const lastTwo: [number, number][] = [
          currentPointsRef.current[currentPointsRef.current.length - 2] || [x, y],
          [x, y],
        ];
        if (activeTool === 'marker') {
          ctx.globalCompositeOperation = 'source-over';
          drawPathOnCanvas(ctx, lastTwo, penColor, brushSize);
        } else if (activeTool === 'highlighter') {
          drawHighlighterStroke(ctx, lastTwo, penColor, brushSize);
        } else if (activeTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          erasePath(ctx, lastTwo, eraserSize);
        }
      }
    },
    [activeTool, penColor, brushSize, eraserSize, zoom]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;
    setIsDrawing(false);

    // Save drawing to store
    if (currentPointsRef.current.length > 2 && activeTool !== 'pointer' && activeTool !== 'comment') {
      addAnnotation({
        id: nanoid(),
        type: 'drawing',
        points: currentPointsRef.current,
        color: penColor,
        brushSize: activeTool === 'eraser' ? eraserSize : brushSize,
        timestamp: Date.now(),
        tool: activeTool === 'eraser' ? 'eraser' : activeTool === 'highlighter' ? 'highlighter' : 'marker',
      });
    }

    currentPointsRef.current = [];
  }, [activeTool, penColor, brushSize, eraserSize, addAnnotation, setIsDrawing]);

  useEffect(() => {
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerUp]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setEraserCursor(null)}
        onPointerUp={handlePointerUp}
        className="absolute inset-0"
        style={{
          zIndex: 50,
          cursor: activeTool === 'eraser' ? 'none' : TOOL_CURSORS[activeTool] ?? 'default',
          // Only capture pointer events while actually drawing/erasing —
          // otherwise this full-board overlay blocks clicks/drags on cards
          // underneath it even when the pointer tool is selected.
          pointerEvents:
            activeTool === 'marker' || activeTool === 'highlighter' || activeTool === 'eraser' ? 'auto' : 'none',
        }}
      />

      {/* Photoshop-style eraser outline: a live circle, sized to exactly
          what the next stroke will erase, following the real cursor.
          Portaled to <body> — this canvas lives inside the pan/zoom-
          transformed board container, and CSS makes any ancestor with a
          `transform` the containing block for position:fixed descendants,
          not the viewport. Left in place, the "fixed" math above resolves
          against that transformed ancestor instead — the circle drifts and
          scales with pan/zoom rather than tracking the real cursor, which
          is exactly what made this feel broken (erasing itself was fine;
          the indicator just wasn't where it looked like it was). */}
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
