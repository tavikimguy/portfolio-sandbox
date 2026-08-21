import React, { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useCanvasStore, type CardTransform } from '@/stores/canvas';
import { fetchAnnotations, createAnnotation } from '@/lib/api';
import { PORTFOLIO_CARDS, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/portfolio-cards';
import { clampPan, computeZoomStep } from '@/lib/canvas-bounds';
import { Card } from './Card';
import { CodeWindowComponent } from './CodeWindow';
import { DrawingCanvas } from './DrawingCanvas';
import { CommentLayer } from './CommentLayer';
import { Toolbar } from './Toolbar';

export function Canvas() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CanvasInner />
    </QueryClientProvider>
  );
}

function CanvasInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; cardX: number; cardY: number } | null>(null);

  const {
    zoom,
    setZoom,
    pan,
    setPan,
    annotations,
    setAnnotations,
    cardTransforms,
    updateCardTransform,
    selectedCardId,
    setSelectedCardId,
    selectedCodeWindowId,
    setSelectedCodeWindowId,
    activeTool,
    setActiveTool,
    codeWindows,
    addCodeWindow,
    eraserSize,
    setEraserSize,
  } = useCanvasStore();

  // Fetch annotations on mount
  const { data: fetchedAnnotations } = useQuery({
    queryKey: ['annotations'],
    queryFn: fetchAnnotations,
    refetchInterval: 5000, // Poll every 5 seconds for new annotations
  });

  // Annotations this tab has created locally but the server hasn't
  // confirmed yet — kept out of the poll-driven overwrite below so a
  // fresh stroke/comment can't be wiped out by a refetch that raced it.
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const syncedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!fetchedAnnotations) return;

    // These came from the server, so they're already saved — mark them
    // synced or the sync effect below would try to re-POST them on every
    // load/poll and collide with their existing row (id is the primary key).
    fetchedAnnotations.forEach((a) => syncedIdsRef.current.add(a.id));

    const current = useCanvasStore.getState().annotations;
    const pending = current.filter((a) => pendingIdsRef.current.has(a.id));
    const pendingIds = new Set(pending.map((a) => a.id));

    setAnnotations([...fetchedAnnotations.filter((a) => !pendingIds.has(a.id)), ...pending]);
  }, [fetchedAnnotations, setAnnotations]);

  // Sync new local annotations to the backend (D1 via /api/annotations)
  useEffect(() => {
    const newOnes = annotations.filter((a) => !syncedIdsRef.current.has(a.id));
    if (newOnes.length === 0) return;

    newOnes.forEach((annotation) => {
      pendingIdsRef.current.add(annotation.id);
      syncedIdsRef.current.add(annotation.id);

      createAnnotation(annotation).then((result) => {
        pendingIdsRef.current.delete(annotation.id);
        if (!result) {
          // createAnnotation swallows its own errors and returns null on
          // failure — un-mark so the next annotations change retries it.
          syncedIdsRef.current.delete(annotation.id);
        }
      });
    });
  }, [annotations]);

  // Initialize card transforms with default positions
  useEffect(() => {
    PORTFOLIO_CARDS.forEach((card) => {
      if (!cardTransforms.has(card.id)) {
        updateCardTransform(card.id, {
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height,
          rotation: 0,
          zIndex: 1,
        });
      }
    });
  }, [cardTransforms, updateCardTransform]);

  // Keeps the wheel listener attached exactly once while still reading
  // fresh values — re-attaching it on every activeTool/eraserSize change
  // would be wasteful for a hot-path listener like this. zoom/pan aren't
  // in here — handleWheel reads those straight from the store so the same
  // freshness guarantee holds without needing this ref to track them too.
  const latestRef = useRef({ activeTool, eraserSize });
  useEffect(() => {
    latestRef.current = { activeTool, eraserSize };
  });

  // On first load, center the viewport on the actual card cluster rather
  // than leaving it at the board's (0,0) origin — the board is much
  // larger than the content that lives in it, so starting at the origin
  // just shows an empty top-left corner with everything off to one side.
  useEffect(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    PORTFOLIO_CARDS.forEach((c) => {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    });
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    setPan(
      clampPan(window.innerWidth / 2 - contentCenterX, window.innerHeight / 2 - contentCenterY, 1)
    );
    // Intentionally once on mount — this is initial framing, not something
    // that should re-run as the user pans/zooms/adds content afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle wheel: Ctrl/Cmd+scroll zooms (matches the browser/Figma
  // convention) or resizes the eraser when it's active, plain scroll pans
  // the board — FigJam-style navigation, bounded to the board's own edges
  // (the dotted grid — see clampPan/clampBoxToBoard in canvas-bounds.ts).
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { activeTool: tool, eraserSize: size } = latestRef.current;
    const { zoom: currentZoom, pan: currentPan } = useCanvasStore.getState();

    if ((e.ctrlKey || e.metaKey) && tool === 'eraser') {
      setEraserSize(size - e.deltaY * 0.15);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const { zoom: newZoom, pan: newPan } = computeZoomStep(currentZoom, currentPan, e.clientX, e.clientY, e.deltaY);
      setZoom(newZoom);
      setPan(newPan);
    } else {
      setPan({ x: currentPan.x - e.deltaX, y: currentPan.y - e.deltaY });
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle card drag
  const handleCardDragStart = (cardId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'pointer') return;

    const transform = cardTransforms.get(cardId);
    if (!transform) return;

    setIsDraggingCard(true);
    setSelectedCardId(cardId);

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cardX: transform.x,
      cardY: transform.y,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = (moveEvent.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (moveEvent.clientY - dragStartRef.current.y) / zoom;

      updateCardTransform(cardId, {
        x: dragStartRef.current.cardX + deltaX,
        y: dragStartRef.current.cardY + deltaY,
      });
    };

    const handleEnd = () => {
      setIsDraggingCard(false);
      dragStartRef.current = null;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen bg-gray-50 overflow-hidden"
      style={{
        cursor: isDraggingCard
          ? 'grabbing'
          : activeTool === 'marker' || activeTool === 'highlighter' || activeTool === 'eraser' || activeTool === 'code'
            ? 'crosshair'
            : 'default',
      }}
    >
      <Toolbar />

      {/* Canvas Container */}
      <div
        className="absolute"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        }}
      >
        {/* Canvas Background */}
        <div
          className="absolute inset-0 bg-white border-2 border-gray-200"
          onClick={(e) => {
            if (activeTool === 'code') {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - rect.left) / zoom;
              const y = (e.clientY - rect.top) / zoom;
              addCodeWindow(x, y);
              setActiveTool('pointer');
              return;
            }
            // Clicking empty canvas deselects whatever card/code window was
            // selected — otherwise a selection (and a code window's editor
            // view) had no way to close once opened.
            if (activeTool === 'pointer') {
              setSelectedCardId(null);
              setSelectedCodeWindowId(null);
            }
          }}
        >
          {/* Dot Grid Background, FigJam-style */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.18) 1.5px, transparent 1.5px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Portfolio Cards */}
        {PORTFOLIO_CARDS.map((card) => {
          const transform = cardTransforms.get(card.id);
          if (!transform) return null;

          return (
            <Card
              key={card.id}
              card={card}
              isSelected={selectedCardId === card.id}
              onSelect={() => setSelectedCardId(card.id)}
              onDragStart={handleCardDragStart(card.id)}
              transform={transform}
            />
          );
        })}

        {/* Code Windows */}
        {codeWindows.map((win) => (
          <CodeWindowComponent
            key={win.id}
            window={win}
            isSelected={selectedCodeWindowId === win.id}
            onSelect={() => setSelectedCodeWindowId(win.id)}
          />
        ))}

        {/* Drawing Canvas */}
        <DrawingCanvas canvasWidth={CANVAS_WIDTH} canvasHeight={CANVAS_HEIGHT} zoom={zoom} />

        {/* Comment Layer */}
        <CommentLayer canvasWidth={CANVAS_WIDTH} canvasHeight={CANVAS_HEIGHT} zoom={zoom} />
      </div>

      {/* Zoom/Pan Info */}
      <div className="fixed bottom-4 right-4 bg-white rounded-lg p-3 text-xs text-gray-600 border border-gray-200">
        <p>Zoom: {(zoom * 100).toFixed(0)}%</p>
        <p className="text-xs text-gray-500 mt-1">Ctrl + Scroll to zoom</p>
      </div>
    </div>
  );
}
