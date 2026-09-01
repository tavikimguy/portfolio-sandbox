import { useEffect } from 'react';
import { useMotionValue, useVelocity } from 'motion/react';

// Global cursor speed, tracked continuously (not just while hovering a
// tile) — that's what lets the bobble-hover effect know how fast the
// pointer was moving the INSTANT it arrived at a tile, not just after.
// Shared by every item card via a single document-level listener rather
// than each tile running its own.
export function usePointerVelocity() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const vx = useVelocity(x);
  const vy = useVelocity(y);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [x, y]);

  return { vx, vy };
}
