import React, { useRef } from 'react';
import { motion } from 'motion/react';
import type { PortfolioCard } from '@/lib/portfolio-cards';
import { useCanvasStore } from '@/stores/canvas';

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
  onSelect,
  onDragStart,
  transform,
}: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const updateCardTransform = useCanvasStore((s) => s.updateCardTransform);

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
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  const handleRotateStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const cardEl = cardRef.current;
    if (!cardEl) return;

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
      className={`absolute border-2 rounded-lg cursor-move transition-colors ${
        isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
      } ${card.bgColor}`}
      style={{
        left: transform.x,
        top: transform.y,
        width: transform.width,
        height: transform.height,
        rotate: transform.rotation,
        zIndex: transform.zIndex,
      }}
      onPointerDown={onDragStart}
      onClick={onSelect}
    >
      {/* Content */}
      <div className="p-4 h-full flex flex-col justify-between pointer-events-none select-none overflow-hidden rounded-md">
        <div>
          <h3 className="font-bold text-lg text-gray-900">{card.title}</h3>
          <p className="text-sm text-gray-600 mt-2">{card.description}</p>
        </div>
      </div>

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
