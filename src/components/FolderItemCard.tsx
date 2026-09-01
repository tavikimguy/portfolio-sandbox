import React, { useRef, useState } from 'react';
import { motion, useMotionValue, animate, type MotionValue, type Transition } from 'motion/react';
import type { FolderItem } from '@/lib/portfolio-cards';

const MIN_ITEM_SIZE = 60;

// Same custom rotate cursor as Card.tsx (duplicated rather than shared —
// it's one small data URI, not worth threading a prop/import for).
const ROTATE_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cg fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3Cg fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3C/svg%3E") 10 10, grab`;

// Raw pointer speed comes out of useVelocity in px/second (can run into the
// thousands on a fast flick) — these bring it down to a sane range for a
// scale/rotate motion value before it's injected as spring velocity. Purely
// a feel knob, tune freely.
const BOBBLE_SCALE_VELOCITY = 0.0009;
const BOBBLE_ROTATE_VELOCITY = 0.006;
const MAX_ROTATE_VELOCITY_INPUT = 1800;

interface FolderItemCardProps {
  item: FolderItem;
  transform: { x: number; y: number; width: number; height: number; rotation: number };
  // The size this item bursts out at (Canvas.tsx's itemSize). Everything
  // inside is laid out against this and then scaled to whatever the item
  // has since been resized to, so the content warps with the box instead
  // of reflowing inside it.
  baseSize: { width: number; height: number };
  // The parent card's center at the moment this item mounts — both the
  // enter and exit animation collapse to this single point, so items
  // visibly shoot out of (and get pulled back into) their holder.
  origin: { x: number; y: number };
  isSelected: boolean;
  isDragging: boolean;
  // Selecting is a side effect of starting a drag (see Canvas.tsx's generic
  // handleCardDragStart, reused as-is for items) — no separate click
  // handler needed, unlike folders, which distinguish "click to toggle"
  // from "drag to move."
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  // Covers both resize (x/y/width/height) and the rotate handle
  // (rotation) — one patch callback into the store either way.
  onResize: (patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
  // Board scale, so pointer deltas during a resize can be converted from
  // screen px back into board px.
  zoom: number;
  vx: MotionValue<number>;
  vy: MotionValue<number>;
  // Per-folder spring + stagger delay (Canvas.tsx cycles a few presets
  // across cards so the burst doesn't feel identical everywhere).
  transition: Transition;
}

export function FolderItemCard({
  item,
  transform,
  baseSize,
  origin,
  isSelected,
  isDragging,
  onDragStart,
  onResize,
  zoom,
  vx,
  vy,
  transition,
}: FolderItemCardProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const collapsed = { left: origin.x, top: origin.y, width: 0, height: 0, opacity: 0 };
  // Covers both resize AND rotate — either way this item is being driven
  // directly by hand, so position/size/rotation should track the cursor
  // exactly rather than ease through the burst spring.
  const [isInteracting, setIsInteracting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isTransforming = isDragging || isInteracting;

  // Local, imperatively-driven bobble wiggle — lives on an INNER wrapper,
  // separate from the outer element's own `rotate` (which carries the
  // PERSISTENT rotation set by hand via the rotate handle below). Nesting
  // them is what lets both compose: outer = where you left it, inner =
  // a transient flick on top that always springs back to zero.
  const bobbleScale = useMotionValue(1);
  const bobbleRotate = useMotionValue(0);

  const handleHoverStart = () => {
    const speed = Math.hypot(vx.get(), vy.get());
    animate(bobbleScale, 1, { type: 'spring', stiffness: 300, damping: 10, velocity: speed * BOBBLE_SCALE_VELOCITY });
    const rotateVelocity = Math.max(-MAX_ROTATE_VELOCITY_INPUT, Math.min(MAX_ROTATE_VELOCITY_INPUT, vx.get()));
    animate(bobbleRotate, 0, { type: 'spring', stiffness: 300, damping: 8, velocity: rotateVelocity * BOBBLE_ROTATE_VELOCITY });
  };

  type Corner = 'nw' | 'ne' | 'sw' | 'se';
  const CORNER_CURSORS: Record<Corner, string> = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize' };

  const startResize = (corner: Corner) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = transform.x;
    const startTop = transform.y;
    const startWidth = transform.width;
    const startHeight = transform.height;
    const growsRight = corner === 'ne' || corner === 'se';
    const growsDown = corner === 'sw' || corner === 'se';

    const startAspect = startWidth / startHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      // Pointer deltas are screen px; the board is scaled, so divide by
      // zoom or the corner runs away from the cursor when zoomed out.
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;
      let width = Math.max(MIN_ITEM_SIZE, startWidth + (growsRight ? deltaX : -deltaX));
      let height = Math.max(MIN_ITEM_SIZE, startHeight + (growsDown ? deltaY : -deltaY));

      // Shift locks the proportions, Figma-style: the axis you pulled
      // further wins and the other follows it. Without it the two are
      // independent, which is what lets the content warp.
      if (moveEvent.shiftKey) {
        if (Math.abs(width - startWidth) >= Math.abs(height - startHeight) * startAspect) {
          height = Math.max(MIN_ITEM_SIZE, width / startAspect);
        } else {
          width = Math.max(MIN_ITEM_SIZE, height * startAspect);
        }
      }

      onResize({
        width,
        height,
        x: growsRight ? startLeft : startLeft + (startWidth - width),
        y: growsDown ? startTop : startTop + (startHeight - height),
      });
    };
    const handleEnd = () => {
      setIsInteracting(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
  };

  // Mirrors Card.tsx's own handleRotateStart — same pivot-on-center
  // measurement, same Shift-to-15°-snap.
  const startRotate = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = itemRef.current;
    if (!el) return;
    e.stopPropagation();
    setIsInteracting(true);

    const rect = el.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    document.body.style.cursor = ROTATE_CURSOR;

    const handleMove = (moveEvent: PointerEvent) => {
      const angleRad = Math.atan2(moveEvent.clientY - center.y, moveEvent.clientX - center.x);
      let angleDeg = angleRad * (180 / Math.PI) + 90;
      if (moveEvent.shiftKey) angleDeg = Math.round(angleDeg / 15) * 15;
      onResize({ rotation: angleDeg });
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
      ref={itemRef}
      className="absolute cursor-move select-none overflow-visible"
      initial={collapsed}
      animate={{ left: transform.x, top: transform.y, width: transform.width, height: transform.height, rotate: transform.rotation, opacity: 1 }}
      exit={collapsed}
      transition={isTransforming ? { duration: 0 } : transition}
      // Lifted while hovered so this item's caption panel isn't covered by
      // whichever neighbour happens to render after it.
      style={{ zIndex: hovered ? 20 : 5 }}
      onPointerDown={onDragStart}
      // Hover lives out here, not on the wrapper below: that one is
      // pointer-events-none so it never swallows a drag, which also means
      // it never receives hover.
      onHoverStart={() => {
        setHovered(true);
        handleHoverStart();
      }}
      onHoverEnd={() => setHovered(false)}
    >
      {/* Inner wrapper carries only the transient hover bobble (scale +
          wiggle), composing on top of the outer element's persistent
          position/size/rotation instead of fighting over the same values. */}
      <motion.div className="relative w-full h-full pointer-events-none" style={{ scale: bobbleScale, rotate: bobbleRotate }}>
        {/* A cutout has had its white surround made transparent, so it gets
            no frame at all — no card, no border, no shadow — and reads as
            the artwork sitting straight on the board. Selection still needs
            an outline, so that one border comes back when selected. */}
        <div
          className={`absolute inset-0 flex flex-col overflow-hidden ${
            item.cutout
              ? `rounded-lg ${isSelected ? 'border-2 border-blue-500' : ''}`
              : `rounded-2xl border-2 bg-white shadow-lg ${isSelected ? 'border-blue-500' : 'border-gray-200'}`
          }`}
        >
          {/* object-fill, so the asset stretches with the box the way a
              placed image does in Figma. The burst size already matches the
              asset's true aspect ratio (itemSize in Canvas.tsx), so it
              starts undistorted and only warps once you pull a corner —
              and Shift-resize keeps the ratio, so it never warps by
              accident. Nothing is ever cropped either way. */}
          {item.kind === 'text' ? (
            // Laid out at the burst size and then scaled, so the type grows
            // with the box (and skews with it) instead of the paragraph
            // just reflowing inside a bigger frame.
            <div className="flex-1 overflow-hidden">
              <div
                className="px-4 py-3"
                style={{
                  width: baseSize.width,
                  height: baseSize.height,
                  transformOrigin: 'top left',
                  transform: `scale(${transform.width / baseSize.width}, ${transform.height / baseSize.height})`,
                }}
              >
                <p className="text-[12px] text-gray-600 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ) : item.kind === 'video' ? (
            <video
              src={item.src}
              poster={item.poster}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className={`w-full h-full object-fill ${item.cutout ? '' : 'bg-gray-50'}`}
            />
          ) : (
            <img src={item.src} alt={item.label} loading="lazy" draggable={false} className={`w-full h-full object-fill ${item.cutout ? '' : 'bg-gray-50'}`} />
          )}
        </div>

        {/* Header rides just outside the card as its own pill — separate
            from the asset, still visually attached to it. Lives outside the
            rounded box (hence overflow-visible on the parent), so the
            overlap solver in Canvas.tsx can't see it; PUSH_GAP there is
            widened to leave it room. */}
        <div className="absolute left-1/2 top-full -translate-x-1/2 mt-3 max-w-[115%] rounded-full bg-white shadow-md px-4 py-1.5">
          <span className="block whitespace-nowrap overflow-hidden text-ellipsis text-[13px] font-medium text-gray-800">
            {item.label}
          </span>
        </div>

        {/* Copy about this specific asset — it opens under the label on
            hover rather than living on the board as its own module, so the
            visual it describes is the thing you go to. Absolutely
            positioned, so revealing it never reflows the item. */}
        {item.caption && (
          <div
            className={`absolute left-1/2 top-full -translate-x-1/2 mt-14 w-[125%] rounded-2xl bg-white shadow-lg px-4 py-3 transition-opacity duration-150 ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <p className="text-[11px] text-gray-600 leading-relaxed">{item.caption}</p>
          </div>
        )}
      </motion.div>

      {isSelected && (
        <>
          <div
            className="absolute top-0 left-0 w-3 h-3 -translate-x-1/2 -translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: CORNER_CURSORS.nw }}
            onPointerDown={startResize('nw')}
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 translate-x-1/2 -translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: CORNER_CURSORS.ne }}
            onPointerDown={startResize('ne')}
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 -translate-x-1/2 translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: CORNER_CURSORS.sw }}
            onPointerDown={startResize('sw')}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 translate-x-1/2 translate-y-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: CORNER_CURSORS.se }}
            onPointerDown={startResize('se')}
          />

          {/* Rotate handle */}
          <div className="absolute left-1/2 -top-6 w-0.5 h-4 bg-blue-500 -translate-x-1/2" style={{ pointerEvents: 'none' }} />
          <div
            className="absolute left-1/2 -top-8 w-3 h-3 -translate-x-1/2 bg-blue-500 border-2 border-white rounded-full shadow"
            style={{ cursor: ROTATE_CURSOR }}
            onPointerDown={startRotate}
          />
        </>
      )}
    </motion.div>
  );
}
