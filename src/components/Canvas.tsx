import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useCanvasStore, type CardTransform } from '@/stores/canvas';
import { fetchAnnotations, createAnnotation } from '@/lib/api';
import { PORTFOLIO_CARDS, CANVAS_WIDTH, CANVAS_HEIGHT, type FolderItem } from '@/lib/portfolio-cards';
import { clampZoom, computeZoomStep, clampBoxToBoard } from '@/lib/canvas-bounds';
import { usePointerVelocity } from '@/lib/usePointerVelocity';
import { Card } from './Card';
import { FolderItemCard } from './FolderItemCard';
import { CodeWindowComponent } from './CodeWindow';
import { DrawingCanvas } from './DrawingCanvas';
import { CommentLayer } from './CommentLayer';
import { Toolbar } from './Toolbar';

// Items are shot out radially around a folder that itself never resizes
// (the winner from workshopping three variants). Each media item carries
// its own width/height, fitted to the asset's true aspect ratio, so a
// 16:9 video and a square painting come out correctly proportioned rather
// than cropped into one shared box. Text items have no asset to match.
const TEXT_ITEM_WIDTH = 260;
const TEXT_ITEM_HEIGHT = 230;

function itemSize(item: FolderItem) {
  return {
    width: item.width ?? TEXT_ITEM_WIDTH,
    height: item.height ?? TEXT_ITEM_HEIGHT,
  };
}

// Three hand-tuned "feels," cycled across folders by index so the burst
// isn't visually identical on every card — different radius, spring
// weight, per-item stagger, and starting angle. Not per-card bespoke data,
// just enough variety that browsing between folders doesn't feel robotic.
const BURST_PRESETS = [
  { radius: 300, spring: { type: 'spring', stiffness: 260, damping: 26, mass: 0.8 } as const, stagger: 0.035, angleOffset: -Math.PI / 2 },
  { radius: 340, spring: { type: 'spring', stiffness: 400, damping: 24, mass: 0.6 } as const, stagger: 0.05, angleOffset: -Math.PI / 2 + 0.35 },
  { radius: 270, spring: { type: 'spring', stiffness: 200, damping: 16, mass: 1 } as const, stagger: 0.02, angleOffset: -Math.PI / 2 - 0.35 },
];

function getBurstPreset(cardId: string) {
  const index = PORTFOLIO_CARDS.findIndex((c) => c.id === cardId);
  return BURST_PRESETS[Math.max(0, index) % BURST_PRESETS.length];
}

// Gap kept between any two cards once overlaps are resolved. Deliberately
// tight: the solver's job is to stop things sitting on top of each other,
// NOT to fling the board apart — a burst has to stay on screen, so every
// px here widens the cluster. Enough to clear an item's label pill, which
// hangs below the item's own box where the solver can't see it (see
// FolderItemCard.tsx), and no more.
const PUSH_GAP = 26;
// Passes over every card pair, nudging apart any that still overlap —
// several folders can be expanded at once, so one burst can cascade into
// more than just its immediate neighbor.
const RESOLVE_ITERATIONS = 24;

function childId(cardId: string, itemId: string) {
  return `${cardId}::${itemId}`;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesOverlap(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Minimum-translation-vector push: the offset that moves `box` out along
// whichever axis needs less travel to clear `blocker`, away from blocker's
// center — cheap, deterministic AABB collision resolution. Rotation is
// ignored (cards only rotate a little in practice, so the axis-aligned
// approximation holds up).
function pushOutOf(box: Box, blocker: Box) {
  const overlapX = Math.min(box.x + box.width, blocker.x + blocker.width) - Math.max(box.x, blocker.x);
  const overlapY = Math.min(box.y + box.height, blocker.y + blocker.height) - Math.max(box.y, blocker.y);

  const boxCenterX = box.x + box.width / 2;
  const boxCenterY = box.y + box.height / 2;
  const blockerCenterX = blocker.x + blocker.width / 2;
  const blockerCenterY = blocker.y + blocker.height / 2;

  if (overlapX < overlapY) {
    const dir = boxCenterX < blockerCenterX ? -1 : 1;
    return { dx: dir * overlapX, dy: 0 };
  }
  const dir = boxCenterY < blockerCenterY ? -1 : 1;
  return { dx: 0, dy: dir * overlapY };
}

// Settles every overlapping pair in `boxes` (mutated in place) by moving
// BOTH members apart, split evenly — "they all push each other," not one
// card evicting everyone else. Iterated a few times so a push that creates
// a new overlap with a third card gets resolved too, not just the first hit.
function resolveOverlaps(boxes: Map<string, Box>) {
  const ids = Array.from(boxes.keys());
  for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
    let movedAny = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = boxes.get(ids[i])!;
        const b = boxes.get(ids[j])!;
        const paddedB: Box = { x: b.x - PUSH_GAP, y: b.y - PUSH_GAP, width: b.width + PUSH_GAP * 2, height: b.height + PUSH_GAP * 2 };
        if (!boxesOverlap(a, paddedB)) continue;

        movedAny = true;
        const { dx, dy } = pushOutOf(a, paddedB);
        const aMoved = clampBoxToBoard(a.x + dx / 2, a.y + dy / 2, a.width, a.height);
        const bMoved = clampBoxToBoard(b.x - dx / 2, b.y - dy / 2, b.width, b.height);
        boxes.set(ids[i], { ...a, ...aMoved });
        boxes.set(ids[j], { ...b, ...bMoved });
      }
    }
    if (!movedAny) break;
  }
}

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
  // True for the instant after a real drag (pointer actually moved) ends —
  // the click handler checks and clears it so releasing a drag doesn't also
  // toggle the card it was just dragged from.
  const justDraggedRef = useRef(false);
  // Shared by every shot-out item's hover-bobble — see FolderItemCard.tsx
  // for what it's used for.
  const { vx, vy } = usePointerVelocity();

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
    expandedCardIds,
    toggleExpandedCard,
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

  // Open with every card on screen. The cluster sits in the middle of a
  // 5760x4320 board, so without this the view starts in the board's
  // top-left corner staring at empty grid — and a fixed zoom can't promise
  // the whole cluster fits, since that depends on the window. Fit the
  // cards' bounding box to the viewport instead, then centre on it. Mount
  // only: after this the user's own pan/zoom stands.
  useEffect(() => {
    const left = Math.min(...PORTFOLIO_CARDS.map((c) => c.x));
    const right = Math.max(...PORTFOLIO_CARDS.map((c) => c.x + c.width));
    const top = Math.min(...PORTFOLIO_CARDS.map((c) => c.y));
    const bottom = Math.max(...PORTFOLIO_CARDS.map((c) => c.y + c.height));

    // Breathing room around the cluster so cards don't sit flush against
    // the window edge.
    const MARGIN = 140;
    const zoom = clampZoom(
      Math.min(window.innerWidth / (right - left + MARGIN * 2), window.innerHeight / (bottom - top + MARGIN * 2))
    );
    setZoom(zoom);
    setPan({
      x: window.innerWidth / 2 - ((left + right) / 2) * zoom,
      y: window.innerHeight / 2 - ((top + bottom) / 2) * zoom,
    });
  }, [setZoom, setPan]);

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

    // Only counts as a drag (and so should swallow the click that follows)
    // once the pointer has actually moved a couple px — otherwise every
    // plain click would get eaten as a "just dragged" no-op.
    let moved = false;

    const handleMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = (moveEvent.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (moveEvent.clientY - dragStartRef.current.y) / zoom;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) moved = true;

      updateCardTransform(cardId, {
        x: dragStartRef.current.cardX + deltaX,
        y: dragStartRef.current.cardY + deltaY,
      });
    };

    const handleEnd = () => {
      setIsDraggingCard(false);
      dragStartRef.current = null;
      justDraggedRef.current = moved;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  // Toggle a folder's expanded state. The folder itself never resizes —
  // opening it seeds a fresh burst position for each of its items (fanned
  // out around its own center, using that folder's own preset radius/
  // angle) and closing it just drops them from the render list. Every
  // OTHER already-open folder's items keep their current position as-is
  // (not reseeded) so they don't jump — the resolver only needs to nudge
  // them clear of whatever just changed.
  const handleToggleExpand = (targetId: string) => {
    const card = PORTFOLIO_CARDS.find((c) => c.id === targetId);
    if (!card) return;
    const willExpand = !expandedCardIds.has(targetId);

    const boxes = new Map<string, Box>();
    PORTFOLIO_CARDS.forEach((c) => {
      const t = cardTransforms.get(c.id);
      if (t) boxes.set(c.id, { x: t.x, y: t.y, width: t.width, height: t.height });
    });
    const childIds = new Set<string>();
    expandedCardIds.forEach((openId) => {
      if (openId === targetId) return; // this one's being reseeded below (if opening) or dropped (if closing)
      const openCard = PORTFOLIO_CARDS.find((c) => c.id === openId);
      openCard?.items?.forEach((item) => {
        const id = childId(openId, item.id);
        const t = cardTransforms.get(id);
        if (t) {
          boxes.set(id, { x: t.x, y: t.y, width: t.width, height: t.height });
          childIds.add(id);
        }
      });
    });

    const targetTransform = cardTransforms.get(targetId);
    const items = card.items ?? [];

    if (willExpand && targetTransform && items.length > 0) {
      const preset = getBurstPreset(targetId);
      const centerX = targetTransform.x + targetTransform.width / 2;
      const centerY = targetTransform.y + targetTransform.height / 2;
      const n = items.length;
      items.forEach((item, i) => {
        const id = childId(targetId, item.id);
        const angle = (i / n) * Math.PI * 2 + preset.angleOffset;
        const size = itemSize(item);
        boxes.set(id, {
          x: centerX + Math.cos(angle) * preset.radius - size.width / 2,
          y: centerY + Math.sin(angle) * preset.radius - size.height / 2,
          width: size.width,
          height: size.height,
        });
        childIds.add(id);
      });
    }

    resolveOverlaps(boxes);
    // Items don't rotate and get their own fixed stacking order — folder
    // cards keep whatever rotation/zIndex they already have (a user may
    // have rotated one by hand), so only child ids get those defaulted.
    boxes.forEach((box, id) => {
      updateCardTransform(id, childIds.has(id) ? { ...box, rotation: 0, zIndex: 5 } : box);
    });

    toggleExpandedCard(targetId);
  };

  // Item drag reuses handleCardDragStart as-is below (it doesn't care
  // whether the id is a folder or an item) — this is resize/rotate's
  // equivalent, a thin wrapper so item components don't need direct access
  // to the store action.
  const handleItemResize = (id: string) => (patch: Partial<CardTransform>) => {
    updateCardTransform(id, patch);
  };

  // Single click toggles a card open/closed (unless it was actually a drag
  // release) — wired as the same onSelect prop Card already had.
  const handleCardClick = (cardId: string) => () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setSelectedCardId(cardId);
    handleToggleExpand(cardId);
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
              isExpanded={expandedCardIds.has(card.id)}
              isDragging={isDraggingCard && selectedCardId === card.id}
              onSelect={handleCardClick(card.id)}
              onDragStart={handleCardDragStart(card.id)}
              transform={transform}
            />
          );
        })}

        {/* Items shot out of expanded folders — a separate layer from the
            folder cards themselves, so AnimatePresence can play each
            item's exit (collapse back into its folder) when it's removed
            from this list on close. Draggable/resizable exactly like the
            folder cards, via the same generic handlers. */}
        <AnimatePresence>
          {PORTFOLIO_CARDS.flatMap((card) => {
            if (!expandedCardIds.has(card.id) || !card.items) return [];
            const parentTransform = cardTransforms.get(card.id);
            if (!parentTransform) return [];

            const preset = getBurstPreset(card.id);
            const origin = {
              x: parentTransform.x + parentTransform.width / 2,
              y: parentTransform.y + parentTransform.height / 2,
            };
            return card.items.map((item, i) => {
              const id = childId(card.id, item.id);
              const transform = cardTransforms.get(id);
              if (!transform) return null;
              return (
                <FolderItemCard
                  key={id}
                  item={item}
                  transform={transform}
                  origin={origin}
                  isSelected={selectedCardId === id}
                  isDragging={isDraggingCard && selectedCardId === id}
                  onDragStart={handleCardDragStart(id)}
                  onResize={handleItemResize(id)}
                  vx={vx}
                  vy={vy}
                  transition={{ ...preset.spring, delay: i * preset.stagger }}
                />
              );
            });
          })}
        </AnimatePresence>

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
