# Architecture Guide

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Astro Page (index.astro)                            │   │
│  │  └─> React Island: Canvas Component                 │   │
│  │      ├─ Card Component (draggable, resizable)       │   │
│  │      ├─ DrawingCanvas (HTML5 Canvas for pen/eraser) │   │
│  │      ├─ CommentLayer (sticky notes)                 │   │
│  │      └─ Toolbar (tool controls)                     │   │
│  │                                                      │   │
│  │  Zustand Store                                       │   │
│  │  ├─ Annotations (comments + drawings)               │   │
│  │  ├─ Card Transforms (position, size, rotation)      │   │
│  │  ├─ UI State (active tool, colors, brush size)      │   │
│  │  └─ Undo/Redo History                               │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTP/FETCH
                 ▼
┌─────────────────────────────────────────────────────────────┐
│           Cloudflare Workers (API)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Hono App (_app.ts)                                  │   │
│  │  ├─ POST   /api/annotations    (create)              │   │
│  │  ├─ GET    /api/annotations    (fetch)               │   │
│  │  └─ DELETE /api/annotations/:id (delete)             │   │
│  │                                                      │   │
│  │  Scheduled Events (functions/scheduled.ts)           │   │
│  │  └─ Monthly wipe of old annotations                  │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────────────────┘
                 │ SQL/D1 Bindings
                 ▼
┌─────────────────────────────────────────────────────────────┐
│         Cloudflare D1 (SQLite Database)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ annotations table                                    │   │
│  │ ├─ id (TEXT PRIMARY KEY)                             │   │
│  │ ├─ type (TEXT: 'comment' | 'drawing')                │   │
│  │ ├─ payload (JSON: full annotation object)            │   │
│  │ └─ createdAt (TIMESTAMP)                             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

### Canvas.tsx (Orchestrator)
- Manages zoom/pan state
- Handles card drag & drop
- Fetches annotations from API on mount
- Syncs annotations every 5 seconds
- Renders all child components

### Card.tsx (Portfolio Items)
- Displays portfolio project info
- Handles dragging via pointer events
- Handles resizing via corner handles
- Uses Framer Motion for smooth transforms

### DrawingCanvas.tsx (Drawing Layer)
- HTML5 Canvas element
- Tracks pen/eraser pointer events
- Renders smooth paths using perfect-freehand
- Saves drawings to Zustand store
- Polls D1 for other users' drawings

### CommentLayer.tsx (Annotations)
- Overlay div for comment placement
- Modal for adding comments
- Displays sticky notes for existing comments
- Handles comment deletion (hover to show delete button)

### Toolbar.tsx (Tool Controls)
- Tool selection (pointer, pen, eraser, comment)
- Color picker for pen
- Brush size slider
- Undo/Redo buttons
- All state synced to Zustand

## State Management (Zustand)

The Zustand store (`src/stores/canvas.ts`) is the single source of truth:

```typescript
CanvasState {
  // Global (synced with D1)
  annotations: Annotation[]
  
  // Per-session (local only)
  cardTransforms: Map<cardId, Transform>
  
  // UI
  selectedCardId: string | null
  activeTool: 'pointer' | 'pen' | 'eraser' | 'comment'
  penColor: string
  brushSize: number
  
  // Undo/Redo
  history: Annotation[][]
  historyIndex: number
}
```

### Data Flow

1. **User draws** → DrawingCanvas captures points → `addAnnotation()` → Store updates → Zustand pushes to history
2. **User comments** → CommentLayer modal → `addAnnotation()` → Same as above
3. **Store updates** → React Query will POST to `/api/annotations`
4. **Backend saves** → D1 database stores JSON payload
5. **Other users fetch** → 5s polling → GET `/api/annotations` → Zustand updates → Re-render

## Drawing Pipeline

### Real-Time (Local)

```
PointerDown (Canvas)
  ↓
start tracking points → [x, y, x, y, ...]
  ↓
PointerMove
  ↓
add point to array → drawPathOnCanvas() → Canvas.strokeStyle
  ↓
PointerUp
  ↓
create Annotation object → addAnnotation() → Zustand + History
```

### Persistence

```
Annotation { type: 'drawing', points: [...], color, brushSize }
  ↓
Zustand Store
  ↓
React Query Background (POST)
  ↓
Hono API → D1
  ↓
SELECT * to re-render on other clients
```

## API Endpoints

### GET /api/annotations
```
Response:
{
  annotations: [
    {
      id: 'abc123',
      type: 'comment',
      text: 'Great work!',
      x: 100,
      y: 200,
      color: '#000000',
      timestamp: 1699564800000
    },
    {
      id: 'xyz789',
      type: 'drawing',
      points: [[10, 20], [11, 21], [12, 22]],
      color: '#FF0000',
      brushSize: 3,
      timestamp: 1699564900000
    }
  ]
}
```

### POST /api/annotations
```
Request Body: Annotation
Response: { ...annotation, id }
```

### DELETE /api/annotations/:id
```
Response: { success: true }
```

## Database Schema

```sql
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- 'comment' or 'drawing'
  payload JSON NOT NULL,        -- full annotation as JSON
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_annotations_createdAt ON annotations(createdAt);
CREATE INDEX idx_annotations_type ON annotations(type);
```

**Why JSON payload?**
- Flexible schema (comments and drawings have different fields)
- Easy to store and retrieve complex structures
- No need for separate tables

## Undo/Redo Implementation

Zustand tracks a history array:

```typescript
history = [
  [],                    // Initial state
  [annotation1],         // After first draw
  [annotation1, annotation2],  // After second draw
  [annotation1],         // After undo (back to state 2)
]
historyIndex = 2
```

**Undo:** `historyIndex--` → restore `history[historyIndex]`  
**Redo:** `historyIndex++` → restore `history[historyIndex]`

## Performance Considerations

### Canvas Rendering
- **Not using DOM nodes** for drawing (too slow)
- **Using HTML5 Canvas** for pixel-perfect drawing
- **Drawing renders on-demand** on `pointerMove` events
- **Smooth curves** via perfect-freehand library

### Transforms
- **CSS transforms** (not position/left/top) for GPU acceleration
- **Framer Motion** handles animation smoothly
- **Transform math** is simple (translate + rotate)

### Annotations Sync
- **Polling every 5 seconds** (not WebSocket, simpler)
- **React Query handles caching** automatically
- **New annotations don't clear old ones** (accumulate)

### Database
- **Indexes on createdAt & type** for fast queries
- **Scheduled cleanup** deletes old annotations (30 days)
- **D1 SQLite** is fast for small-medium scale

## Scaling Considerations

### If This Gets Popular

1. **WebSocket real-time** (Durable Objects)
   - Replace polling with Durable Objects for multiplayer cursors
   - Broadcast new annotations instantly

2. **Database optimization**
   - Add pagination (currently fetches all annotations)
   - Add filtering by date/type

3. **Caching layer**
   - Cache frequently accessed annotations in KV
   - Invalidate on new annotation

4. **Rate limiting**
   - Prevent spam (currently no rate limits)
   - Use Cloudflare Workers KV for tracking

## Development Workflow

1. **Make changes to components** → Auto-reload via Astro dev server
2. **Test locally** → `npm run dev` → localhost:3000
3. **Test drawing** → Verify points are correct in browser console
4. **Build & deploy** → `npm run build && npm run deploy`
5. **Check D1 data** → `wrangler d1 execute portfolio_db --command "SELECT * FROM annotations"`

## File Dependencies

```
index.astro
  └─> Canvas.tsx
      ├─> Card.tsx
      ├─> DrawingCanvas.tsx
      │   └─> drawing.ts (utilities)
      ├─> CommentLayer.tsx
      └─> Toolbar.tsx

All components share:
  ├─> stores/canvas.ts (Zustand)
  ├─> lib/api.ts (fetch helpers)
  ├─> lib/portfolio-cards.ts (data)
  └─> React Query (data fetching)

API:
  _app.ts (Hono)
    └─> api/annotations.ts (CRUD)
    └─> scheduled.ts (cleanup)

Database:
  migrations/0001_init.sql (schema)
```

---

**Note:** This architecture is simple and works well for MVP (2-week build). If you need real-time collaboration or 1000s of concurrent users, plan for Phase 2 with Durable Objects.
