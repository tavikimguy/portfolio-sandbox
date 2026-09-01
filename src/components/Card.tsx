import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { PortfolioCard } from '@/lib/portfolio-cards';
import { useCanvasStore } from '@/stores/canvas';

// Used for any position/size change NOT driven by direct pointer dragging
// (push-out-of-the-way, expand, collapse) — a spring, not a duration-based
// ease, so it matches the weight of the drag/resize/rotate motion already
// on this card. Direct pointer interaction bypasses this entirely (see
// isTransforming below) so dragging still tracks the cursor 1:1, no lag.
const REFLOW_SPRING = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 } as const;

// CSS has no built-in "rotate" cursor keyword, so this is a custom cursor:
// a circular arrow icon (white halo behind a black line, so it reads on any
// background), used both on hover over the rotate handle and while dragging.
const ROTATE_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cg fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3Cg fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3C/svg%3E") 10 10, grab`;

// Custom crop-corner cursor icon for resizing, native direction as fallback.
const RESIZE_CURSOR = (fallback: string) => `url('/cursors/resize.png') 15 16, ${fallback}`;

interface CardProps {
  card: PortfolioCard;
  isSelected: boolean;
  isExpanded: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
  };
}

export function Card({
  card,
  isSelected,
  isExpanded,
  isDragging,
  onSelect,
  onDragStart,
  transform,
}: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const updateCardTransform = useCanvasStore((s) => s.updateCardTransform);
  // True only while THIS card is being resized/rotated by hand — kept
  // separate from `isDragging` (drag lives in Canvas.tsx) since resize/
  // rotate are driven entirely by this component's own pointer handlers.
  const [isInteracting, setIsInteracting] = useState(false);
  // Object cards swap a still for a looping clip on hover; see handleHover.
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleHover = (entering: boolean) => {
    setIsHovered(entering);
    const video = videoRef.current;
    if (!video) return;
    if (entering) {
      // play() rejects if the pointer leaves before it resolves — nothing
      // to recover from, the leave branch has already paused it.
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  };
  // Any direct pointer manipulation should track the cursor exactly, with
  // no spring lag — only non-interactive position changes (push/expand/
  // collapse) get the spring.
  const isTransforming = isDragging || isInteracting;

  // One resize handle per corner, each anchored on the OPPOSITE corner —
  // dragging the top-left handle keeps the bottom-right corner fixed, etc.
  // — matching how a real bounding box resizes.
  type Corner = 'nw' | 'ne' | 'sw' | 'se';
  const CORNER_CURSORS: Record<Corner, string> = {
    nw: 'nw-resize',
    ne: 'ne-resize',
    sw: 'sw-resize',
    se: 'se-resize',
  };

  const handleResizeStart = (corner: Corner) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = transform.x;
    const startTop = transform.y;
    const startWidth = transform.width;
    const startHeight = transform.height;

    document.body.style.cursor = RESIZE_CURSOR(CORNER_CURSORS[corner]);

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const growsRight = corner === 'ne' || corner === 'se';
      const growsDown = corner === 'sw' || corner === 'se';

      const width = Math.max(100, startWidth + (growsRight ? deltaX : -deltaX));
      const height = Math.max(100, startHeight + (growsDown ? deltaY : -deltaY));

      updateCardTransform(card.id, {
        width,
        height,
        x: growsRight ? startLeft : startLeft + (startWidth - width),
        y: growsDown ? startTop : startTop + (startHeight - height),
      });
    };

    const handleEnd = () => {
      setIsInteracting(false);
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  const handleRotateStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const cardEl = cardRef.current;
    if (!cardEl) return;
    e.stopPropagation();
    setIsInteracting(true);

    // Measure the center once, up front — rotation pivots around it, so it
    // doesn't move during the drag. Re-measuring every pointermove (via
    // getBoundingClientRect) forces a synchronous layout reflow on every
    // frame, which is what was causing the rotate lag.
    const rect = cardEl.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    document.body.style.cursor = ROTATE_CURSOR;

    const handleMove = (moveEvent: PointerEvent) => {
      const angleRad = Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x);
      // Handle sits above the card (pointing "up" = 0deg), so offset by 90deg
      let angleDeg = angleRad * (180 / Math.PI) + 90;

      // Hold Shift to snap to 15-degree increments, FigJam-style
      if (moveEvent.shiftKey) {
        angleDeg = Math.round(angleDeg / 15) * 15;
      }

      updateCardTransform(card.id, { rotation: angleDeg });
    };

    const handleEnd = () => {
      setIsInteracting(false);
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  return (
    <motion.div
      ref={cardRef}
      // An object card drops the whole panel — no border, no fill, no
      // shadow — so the artwork itself is the thing on the board. Selection
      // and expansion still need to read, so those rings stay.
      className={`absolute cursor-move transition-colors ${
        card.object
          ? isSelected
            ? 'border-2 border-blue-500 rounded-lg'
            : ''
          : `border-2 rounded-lg ${
              isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
            } ${card.bgColor}`
      } ${isExpanded ? 'ring-2 ring-offset-2 ring-blue-300 rounded-lg' : ''}`}
      // left/top/width/height/rotate are animated (spring) rather than set
      // via plain style — that's what makes push/expand/collapse glide
      // instead of teleport. transition below switches to instant whenever
      // THIS card is the one being directly dragged/resized/rotated, so
      // hand-driven interaction still tracks the cursor with zero lag.
      animate={{
        left: transform.x,
        top: transform.y,
        width: transform.width,
        height: transform.height,
        rotate: transform.rotation,
      }}
      transition={isTransforming ? { duration: 0 } : REFLOW_SPRING}
      // Expanded cards render above collapsed ones so they don't get
      // visually buried mid-push; among several expanded at once, relative
      // order doesn't matter since they've all been pushed clear of overlap.
      style={{ zIndex: isExpanded ? 10 : transform.zIndex }}
      onPointerDown={onDragStart}
      onClick={onSelect}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
    >
      {/* The card is just the holder/trigger — it never shows its own
          content. What's "inside" it shoots out as separate item cards
          (see Canvas.tsx) when isExpanded flips on. */}
      {card.object ? (
        <div className="relative h-full w-full pointer-events-none select-none">
          {/* Still and clip are stacked and cross-faded rather than swapped,
              so there's no blank frame while the video starts. Frame 0 of
              the clip IS the still, so the two line up exactly. */}
          <img
            src={card.object.still}
            alt={card.title}
            draggable={false}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
              isHovered ? 'opacity-0' : 'opacity-100'
            } ${card.object.invertForLightBoard ? 'invert mix-blend-multiply' : ''}`}
          />
          <video
            ref={videoRef}
            src={card.object.video}
            muted
            loop
            playsInline
            preload="auto"
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            } ${card.object.invertForLightBoard ? 'invert mix-blend-multiply' : ''}`}
          />
        </div>
      ) : (
        <div className="p-4 h-full flex flex-col justify-between pointer-events-none select-none overflow-hidden rounded-md">
          <div>
            <h3 className="font-bold text-lg text-gray-900">{card.title}</h3>
            <p className="text-sm text-gray-600 mt-2">{card.description}</p>
          </div>
        </div>
      )}

      {isSelected && (
        <>
          {/* Resize Handles — one per corner */}
          <div
            className="absolute top-0 left-0 w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: RESIZE_CURSOR(CORNER_CURSORS.nw) }}
            onPointerDown={handleResizeStart('nw')}
          />
          <div
            className="absolute top-0 right-0 w-4 h-4 translate-x-1/2 -translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: RESIZE_CURSOR(CORNER_CURSORS.ne) }}
            onPointerDown={handleResizeStart('ne')}
          />
          <div
            className="absolute bottom-0 left-0 w-4 h-4 -translate-x-1/2 translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: RESIZE_CURSOR(CORNER_CURSORS.sw) }}
            onPointerDown={handleResizeStart('sw')}
          />
          <div
            className="absolute bottom-0 right-0 w-4 h-4 translate-x-1/2 translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: RESIZE_CURSOR(CORNER_CURSORS.se) }}
            onPointerDown={handleResizeStart('se')}
          />

          {/* Rotate Handle */}
          <div
            className="absolute left-1/2 -top-8 w-0.5 h-6 bg-blue-500 -translate-x-1/2"
            style={{ pointerEvents: 'none' }}
          />
          <div
            className="absolute left-1/2 -top-10 w-4 h-4 -translate-x-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: ROTATE_CURSOR }}
            onPointerDown={handleRotateStart}
          />
        </>
      )}
    </motion.div>
  );
}
