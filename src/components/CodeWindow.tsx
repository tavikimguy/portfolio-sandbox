import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useCanvasStore, type CodeWindow as CodeWindowType } from '@/stores/canvas';
import { computeZoomStep } from '@/lib/canvas-bounds';

// Same custom rotate cursor used on portfolio cards, for consistency.
const ROTATE_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cg fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3Cg fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10a6 6 0 1 1 1.8 4.3'/%3E%3Cpath d='M2.5 8.5 4.5 12.5 8.5 11'/%3E%3C/g%3E%3C/svg%3E") 10 10, grab`;

const RESIZE_CURSOR = (fallback: string) => `url('/cursors/resize.png') 15 16, ${fallback}`;

type Tab = 'html' | 'css' | 'js';
const TABS: Tab[] = ['html', 'css', 'js'];

interface CodeWindowProps {
  window: CodeWindowType;
  isSelected: boolean;
  onSelect: () => void;
}

// Injected ahead of the user's own JS. An iframe's content is a separate
// document — clicks/drags inside it never bubble out to the parent page,
// so without this the preview has to choose between "the demo can hear
// the mouse" and "clicking it can select the window." postMessage lets it
// do both: the iframe stays fully interactive (so a demo's own
// mouse-tracking works even while unselected), and this just also tells
// the parent about clicks/drags so it can select or move the window.
// Forwards pointerdown/move/up for as long as the mouse stays inside the
// iframe — not just the initial pointerdown. A pointermove/up that happens
// while the cursor is over the iframe is delivered to *its* document, not
// the parent's, so the parent's own native document-level drag listeners
// go silent for exactly that span; without this the window would only
// keep tracking once the cursor happened to drift back out over the
// parent page.
// windowId travels in every message so the parent can tell "which code
// window's iframe sent this" from the payload itself, not from matching
// event.source against a ref. That ref-matching approach broke: selecting
// the window via this same bridge unmounts the unselected-mode iframe and
// mounts a differently-refed one, so a trailing message already in flight
// (the 'pointerup' sent right after 'click', both queued from the same
// handler) would arrive after the swap and get silently dropped by a
// stale/null ref check — leaking an un-cleaned-up drag listener that then
// hijacked any later mouse movement on the page. A window's own id never
// changes across that swap, so matching on it instead is swap-proof.
function buildBridgeScript(windowId: string) {
  const id = JSON.stringify(windowId);
  return `<script>(function() {
  var WINDOW_ID = ${id};
  var down = null, dragging = false;
  document.addEventListener('pointerdown', function(e) {
    down = { x: e.clientX, y: e.clientY };
    dragging = false;
    parent.postMessage({ source: 'code-window', windowId: WINDOW_ID, type: 'pointerdown', clientX: e.clientX, clientY: e.clientY }, '*');
  }, true);
  document.addEventListener('pointermove', function(e) {
    if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) dragging = true;
    // e.buttons (not the local "down" flag) — a resize/rotate drag starts
    // on the parent page, not inside this iframe, so there was never a
    // pointerdown here to set "down". Gating on "down" would silently drop
    // pointermove for exactly the interactions most likely to sweep across
    // this iframe (a resize handle sits right at its edge). buttons
    // reflects whichever mouse button is actually held right now,
    // regardless of where the press started.
    if (e.buttons !== 0) {
      parent.postMessage({ source: 'code-window', windowId: WINDOW_ID, type: 'pointermove', clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }, '*');
    }
  }, true);
  document.addEventListener('pointerup', function() {
    if (down && !dragging) parent.postMessage({ source: 'code-window', windowId: WINDOW_ID, type: 'click' }, '*');
    parent.postMessage({ source: 'code-window', windowId: WINDOW_ID, type: 'pointerup' }, '*');
    down = null;
    dragging = false;
  }, true);
  // Wheel events over the iframe never reach the parent's own listener
  // either (same cross-document isolation as pointer events) — without
  // forwarding these, scroll-to-pan and Ctrl+scroll-to-zoom silently do
  // nothing while the cursor happens to be over a code window, and an
  // un-preventDefault'd trackpad swipe can fall through to the browser's
  // own back/forward navigation gesture instead.
  document.addEventListener('wheel', function(e) {
    e.preventDefault();
    parent.postMessage({
      source: 'code-window', windowId: WINDOW_ID, type: 'wheel',
      clientX: e.clientX, clientY: e.clientY,
      deltaX: e.deltaX, deltaY: e.deltaY,
      ctrlKey: e.ctrlKey, metaKey: e.metaKey,
    }, '*');
  }, { passive: false });
})();</script>`;
}

function buildSrcDoc(win: CodeWindowType) {
  return `<!DOCTYPE html>
<html>
<head><style>${win.css}</style></head>
<body>
${buildBridgeScript(win.id)}
${win.html}
<script>${win.js}<\/script>
</body>
</html>`;
}

export function CodeWindowComponent({ window: win, isSelected, onSelect }: CodeWindowProps) {
  const updateCodeWindow = useCanvasStore((s) => s.updateCodeWindow);
  const removeCodeWindow = useCanvasStore((s) => s.removeCodeWindow);
  const activeTool = useCanvasStore((s) => s.activeTool);

  const windowRef = useRef<HTMLDivElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('html');
  const [srcDoc, setSrcDoc] = useState(() => buildSrcDoc(win));

  // The message handler's effect only re-runs when isSelected/activeTool/
  // onSelect change, so its closure can go stale between drags — this ref
  // stays current every render regardless, so beginDrag always reads the
  // window's real position rather than whatever it was when that closure
  // was last created.
  const winRef = useRef(win);
  winRef.current = win;

  // Debounce the live preview so it re-renders after typing pauses, not on
  // every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setSrcDoc(buildSrcDoc(win)), 400);
    return () => clearTimeout(timeout);
  }, [win.html, win.css, win.js]);

  // One shared "active interaction" slot for drag, resize, and rotate
  // alike, fed by two sources at once: native document listeners (fire
  // while the cursor is over the parent page) and the bridge messages
  // above (fire while it's over the iframe). Resize/rotate handles sit
  // right at — or, while shrinking, get dragged straight across — the
  // iframe's own edge, so without this a resize/rotate drag that happens
  // to end (or just pass through) over the iframe would never see its
  // pointerup: the browser delivers that event to the iframe's own
  // document, not this one, leaving the native listener permanently
  // attached and pointed at whatever handler started it. Every future
  // mouse movement anywhere on the page then keeps feeding that stale
  // handler — the exact leak this fixed for whole-window dragging earlier;
  // resize/rotate need the same protection since their handles are even
  // closer to the iframe than the title bar is.
  const activeInteractionRef = useRef<{
    onMove: (pageX: number, pageY: number, shiftKey: boolean) => void;
    onEnd: () => void;
  } | null>(null);
  const interactionCleanupRef = useRef<(() => void) | null>(null);

  const endInteraction = () => {
    activeInteractionRef.current?.onEnd();
    activeInteractionRef.current = null;
    interactionCleanupRef.current?.();
    interactionCleanupRef.current = null;
  };

  const beginInteraction = (
    onMove: (pageX: number, pageY: number, shiftKey: boolean) => void,
    onEnd: () => void = () => {}
  ) => {
    // An interaction already in flight (shouldn't normally happen, but a
    // stray leftover pointerdown could race one) gets cleanly ended first
    // rather than silently overwritten out from under its own listeners.
    endInteraction();
    activeInteractionRef.current = { onMove, onEnd };

    const handleMove = (moveEvent: PointerEvent) => activeInteractionRef.current?.onMove(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
    const handleEnd = () => endInteraction();
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
    interactionCleanupRef.current = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
    };
  };

  const beginDrag = (startPageX: number, startPageY: number) => {
    const startLeft = winRef.current.x;
    const startTop = winRef.current.y;
    beginInteraction((pageX, pageY) => {
      updateCodeWindow(winRef.current.id, {
        x: startLeft + (pageX - startPageX),
        y: startTop + (pageY - startPageY),
      });
    });
  };

  // Whole-box drag when a pointerdown lands directly on the parent DOM
  // (the title bar, when selected).
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'pointer') return;
    beginDrag(e.clientX, e.clientY);
  };

  // The unselected preview fills the whole box and is always interactive
  // (so its own demo can react to the mouse), so its clicks/drags arrive
  // via the bridge script above instead of a normal DOM event here.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Matched by the window's own id, not by event.source against a ref
      // — that ref can go stale mid-interaction (selecting via this same
      // bridge swaps out the iframe it points to), which would silently
      // drop a legitimate trailing message. The id never changes.
      if (event.data?.source !== 'code-window' || event.data.windowId !== winRef.current.id) return;

      // pointerup/click don't need the iframe's rect, so they're handled
      // (and any in-flight interaction always gets cleaned up) even if the
      // ref below is stale or null by the time this particular message
      // arrives.
      if (event.data.type === 'pointerup') {
        endInteraction();
        return;
      }
      if (event.data.type === 'click') {
        if (!isSelected && activeTool === 'pointer') onSelect();
        return;
      }

      if (!previewIframeRef.current) return;
      const rect = previewIframeRef.current.getBoundingClientRect();
      const pageX = rect.left + event.data.clientX;
      const pageY = rect.top + event.data.clientY;

      if (event.data.type === 'pointerdown') {
        if (isSelected || activeTool !== 'pointer') return;
        beginDrag(pageX, pageY);
      } else if (event.data.type === 'pointermove') {
        // Routes to whichever interaction is currently active — drag,
        // resize, or rotate — not just a drag-specific handler, so a
        // resize/rotate that sweeps across the iframe keeps tracking too.
        activeInteractionRef.current?.onMove(pageX, pageY, event.data.shiftKey);
      } else if (event.data.type === 'wheel') {
        // Same pan/zoom the parent's own wheel listener does, using the
        // iframe's rect to convert the forwarded local coordinates into
        // page coordinates first — otherwise Ctrl+scroll/scroll silently
        // does nothing while the cursor happens to be over a code window.
        const store = useCanvasStore.getState();
        if ((event.data.ctrlKey || event.data.metaKey) && activeTool === 'eraser') {
          store.setEraserSize(store.eraserSize - event.data.deltaY * 0.15);
        } else if (event.data.ctrlKey || event.data.metaKey) {
          const { zoom: newZoom, pan: newPan } = computeZoomStep(store.zoom, store.pan, pageX, pageY, event.data.deltaY);
          store.setZoom(newZoom);
          store.setPan(newPan);
        } else {
          store.setPan({ x: store.pan.x - event.data.deltaX, y: store.pan.y - event.data.deltaY });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isSelected, activeTool, onSelect]);

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
    const startLeft = winRef.current.x;
    const startTop = winRef.current.y;
    const startWidth = winRef.current.width;
    const startHeight = winRef.current.height;

    document.body.style.cursor = RESIZE_CURSOR(CORNER_CURSORS[corner]);

    beginInteraction(
      (pageX, pageY) => {
        const deltaX = pageX - startX;
        const deltaY = pageY - startY;
        const growsRight = corner === 'ne' || corner === 'se';
        const growsDown = corner === 'sw' || corner === 'se';

        const width = Math.max(320, startWidth + (growsRight ? deltaX : -deltaX));
        const height = Math.max(220, startHeight + (growsDown ? deltaY : -deltaY));

        updateCodeWindow(winRef.current.id, {
          width,
          height,
          x: growsRight ? startLeft : startLeft + (startWidth - width),
          y: growsDown ? startTop : startTop + (startHeight - height),
        });
      },
      () => {
        document.body.style.cursor = '';
      }
    );
  };

  const handleRotateStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    document.body.style.cursor = ROTATE_CURSOR;

    beginInteraction(
      (pageX, pageY, shiftKey) => {
        const angleRad = Math.atan2(pageY - center.y, pageX - center.x);
        let angleDeg = angleRad * (180 / Math.PI) + 90;
        if (shiftKey) angleDeg = Math.round(angleDeg / 15) * 15;
        updateCodeWindow(winRef.current.id, { rotation: angleDeg });
      },
      () => {
        document.body.style.cursor = '';
      }
    );
  };

  return (
    <motion.div
      ref={windowRef}
      className="absolute rounded-xl border border-gray-700 shadow-2xl bg-[#1e1e2e]"
      style={{
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        rotate: win.rotation,
        zIndex: win.zIndex,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* overflow-hidden lives here, not on the root — the resize/rotate
          handles below extend outside the box via negative offsets, and
          clipping at the root would cut them off along with their hit
          area (same issue fixed on Card.tsx's rotate handle earlier). */}
      <div className="w-full h-full rounded-xl overflow-hidden flex flex-col">
        {!isSelected ? (
          // Unselected: just the rendered output, full box, nothing else —
          // no editor, no bounding-box chrome. Fully interactive (so its
          // own demo still reacts to hover), with click-to-select and
          // drag-to-move arriving via the bridge script's postMessage.
          <iframe
            ref={previewIframeRef}
            title={`preview-${win.id}`}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="w-full h-full bg-white"
          />
        ) : (
          <>
            {/* Title bar — drag handle, only needed once the body below is
                the interactive editor rather than a plain click target. */}
            <div
              className="flex items-center justify-between h-9 px-2 bg-[#161622] border-b border-gray-700 cursor-move select-none shrink-0"
              onPointerDown={handleDragStart}
            >
              <div className="flex gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setActiveTab(tab)}
                    className={clsx(
                      'px-2.5 py-1 text-xs font-medium rounded-md uppercase tracking-wide transition-colors',
                      activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeCodeWindow(win.id)}
                className="text-gray-500 hover:text-red-400 p-1 rounded"
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body: code pane + live preview */}
            <div className="flex flex-1 min-h-0">
              <textarea
                value={win[activeTab]}
                onChange={(e) => updateCodeWindow(win.id, { [activeTab]: e.target.value } as Partial<CodeWindowType>)}
                onPointerDown={(e) => e.stopPropagation()}
                spellCheck={false}
                className="w-1/2 h-full resize-none bg-[#1e1e2e] text-gray-100 text-xs font-mono p-3 focus:outline-none border-r border-gray-700"
              />
              <iframe
                ref={previewIframeRef}
                title={`preview-${win.id}`}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                className="w-1/2 h-full bg-white"
              />
            </div>
          </>
        )}
      </div>

      {/* Resize + rotate handles — only while selected, same as cards */}
      {isSelected && (
        <>
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

          <div className="absolute left-1/2 -top-8 w-0.5 h-6 bg-blue-500 -translate-x-1/2" style={{ pointerEvents: 'none' }} />
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
