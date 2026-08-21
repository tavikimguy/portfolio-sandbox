import React from 'react';
import { useCanvasStore } from '@/stores/canvas';
import clsx from 'clsx';
import { MousePointer2, Pen, Highlighter, Eraser, MessageCircle, Code, Undo2, Redo2 } from 'lucide-react';

// A tight, FigJam-like palette — a handful of solid presets plus a genuine
// "pick anything" swatch, rather than one big swatch row.
const PRESET_COLORS = ['#000000', '#E53935', '#FB8C00', '#43A047', '#1E88E5', '#8E24AA'];

// FigJam offers exactly two stroke weights, not a continuous slider.
const BRUSH_SIZES = [
  { label: 'Thin', value: 3 },
  { label: 'Thick', value: 10 },
] as const;

const TOOLS = [
  { id: 'pointer', label: 'Move', Icon: MousePointer2 },
  { id: 'marker', label: 'Marker', Icon: Pen },
  { id: 'highlighter', label: 'Highlighter', Icon: Highlighter },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'comment', label: 'Comment', Icon: MessageCircle },
  { id: 'code', label: 'Code window', Icon: Code },
] as const;

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    penColor,
    setPenColor,
    brushSize,
    setBrushSize,
    eraserSize,
    setEraserSize,
    undo,
    redo,
    historyIndex,
    history,
  } = useCanvasStore();

  const showOptions = activeTool === 'marker' || activeTool === 'highlighter' || activeTool === 'eraser';
  const showColor = activeTool === 'marker' || activeTool === 'highlighter';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300]">
      {/* Floating options flyout — anchored above the toolbar, not inline,
          so the toolbar itself never resizes when a tool is selected. */}
      {showOptions && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 px-3 py-2 whitespace-nowrap">
          {showColor && (
            <>
              <div className="flex items-center gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setPenColor(color)}
                    className={clsx(
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      penColor === color ? 'border-blue-500 scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
                <label
                  className={clsx(
                    'relative w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden transition-transform',
                    !PRESET_COLORS.includes(penColor) ? 'border-blue-500 scale-110' : 'border-transparent'
                  )}
                  style={{
                    background:
                      'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                  }}
                  title="Custom color"
                >
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => setPenColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </div>
              <div className="w-px h-6 bg-gray-200" />
            </>
          )}

          {activeTool === 'eraser' ? (
            <div className="flex items-center gap-2" title="Ctrl/Cmd + Scroll, or [ and ], also resize it">
              <span className="rounded-full border-2 border-gray-900 shrink-0" style={{ width: 16, height: 16 }} />
              <input
                type="range"
                min={8}
                max={120}
                value={eraserSize}
                onChange={(e) => setEraserSize(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-xs text-gray-500 w-7 tabular-nums">{Math.round(eraserSize)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size.value}
                  onClick={() => setBrushSize(size.value)}
                  className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                    brushSize === size.value ? 'bg-blue-100' : 'hover:bg-gray-100'
                  )}
                  title={size.label}
                >
                  <span
                    className="rounded-full bg-gray-900"
                    style={{ width: size.value, height: size.value }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main toolbar — fixed-size icon-only pill, matching FigJam */}
      <div className="flex items-center gap-1 bg-white rounded-2xl shadow-lg border border-gray-200 p-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              setActiveTool(tool.id);
              // Black reads as a gray smudge under multiply blending —
              // default to a proper highlight color instead, but only
              // when the user hasn't already picked something else.
              if (tool.id === 'highlighter' && penColor === '#000000') {
                setPenColor('#FFFF00');
              }
            }}
            className={clsx(
              'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
              activeTool === tool.id
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            )}
            title={tool.label}
          >
            <tool.Icon size={18} strokeWidth={2} />
          </button>
        ))}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={undo}
          disabled={historyIndex === 0}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          title="Undo"
        >
          <Undo2 size={18} strokeWidth={2} />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          title="Redo"
        >
          <Redo2 size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
