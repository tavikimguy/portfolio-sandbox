# Portfolio Sandbox

A FigJam-inspired interactive portfolio canvas built with Astro, React, and Cloudflare Workers.

## Features

- 🎨 **Bounded Canvas** (1920×1440px) with zoom and pan
- 🖱️ **Draggable Cards** - Reposition portfolio items freely
- ✏️ **Drawing Tools** - Pen, eraser with color picker and brush size control
- 💬 **Annotations** - Add comments to the canvas
- ↩️ **Undo/Redo** - Full history support
- 🌍 **Shared Canvas** - All visitors see the same annotations
- 🗑️ **Auto-Cleanup** - Monthly wipe of old annotations via Cloudflare Scheduled Events

## Tech Stack

**Frontend:**
- Astro 5 + React 19
- Tailwind CSS
- Framer Motion (animations)
- Zustand (state management)
- React Query (data fetching)
- Perfect-freehand (smooth drawing)

**Backend:**
- Hono (lightweight API)
- Cloudflare Workers
- Cloudflare D1 (SQLite)

**Deployment:**
- Cloudflare Pages (frontend)
- Cloudflare Workers (API)
- Cloudflare D1 (database)

## Local Development

### Prerequisites

- Node.js 18+
- npm or pnpm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Setup

```bash
# Install dependencies
npm install

# Set up git (local scope for this repo)
git config user.name "Octavius Kim"
git config user.email "tavikim2001@gmail.com"
```

### Running Locally

```bash
# Start dev server with local D1
npm run dev

# In another terminal, watch for DB changes
wrangler d1 execute portfolio_db --file migrations/0001_init.sql --local
```

Visit `http://localhost:3000` to see the canvas.

### Database Migrations

```bash
# Create local database
wrangler d1 create portfolio_db --local

# Run migrations locally
wrangler d1 execute portfolio_db --file migrations/0001_init.sql --local

# Run migrations on production
wrangler d1 migrations apply portfolio_db --remote
```

## Deployment

### First-Time Setup

1. **Create Cloudflare D1 database:**
   ```bash
   wrangler d1 create portfolio_db
   ```
   This will output a database ID. Update `wrangler.toml` with this ID.

2. **Deploy:**
   ```bash
   npm run build
   npm run deploy
   ```

3. **Run migrations on production:**
   ```bash
   npm run db:migrations
   ```

### Subsequent Deployments

```bash
npm run deploy
```

## Project Structure

```
portfolio-sandbox/
├─ src/
│  ├─ components/
│  │  ├─ Canvas.tsx           (main canvas orchestrator)
│  │  ├─ Card.tsx             (draggable portfolio cards)
│  │  ├─ DrawingCanvas.tsx     (drawing layer)
│  │  ├─ CommentLayer.tsx      (comments)
│  │  └─ Toolbar.tsx           (tool controls)
│  ├─ stores/
│  │  └─ canvas.ts            (Zustand state)
│  ├─ lib/
│  │  ├─ portfolio-cards.ts    (card definitions)
│  │  ├─ drawing.ts           (drawing utilities)
│  │  └─ api.ts               (API client)
│  ├─ pages/
│  │  └─ index.astro          (main page)
│  └─ styles/
├─ functions/
│  ├─ _app.ts                 (Hono app)
│  ├─ api/
│  │  └─ annotations.ts       (CRUD endpoints)
│  └─ scheduled.ts            (monthly cleanup)
├─ migrations/
│  └─ 0001_init.sql           (database schema)
├─ wrangler.toml              (Cloudflare config)
└─ astro.config.mjs           (Astro config)
```

## How It Works

### Canvas State Management

- **Zustand store** holds:
  - Global annotations (comments + drawings) - synced with D1
  - Per-session card transforms (position, size, rotation)
  - UI state (selected tool, pen color, brush size)
  - Undo/redo history

### Rendering Pipeline

1. **Astro** generates the HTML shell
2. **React** mounts the Canvas component (client-side)
3. **Cards** render with CSS transforms (GPU-accelerated)
4. **DrawingCanvas** (HTML5 canvas) renders pen/eraser strokes
5. **CommentLayer** (React) handles comment UI
6. **Toolbar** controls tool state

### Data Flow

- **Drawing** → Local canvas + add to store → POST to `/api/annotations` → D1
- **Comments** → Modal → Add to store → POST to `/api/annotations` → D1
- **Fetch** → Mount + 5s polling → GET `/api/annotations` → Update store
- **Delete** → Remove from store → DELETE `/api/annotations/:id`

## Customization

### Add More Portfolio Cards

Edit `src/lib/portfolio-cards.ts`:

```typescript
{
  id: 'new-project',
  title: 'Project Name',
  description: 'Short description',
  x: 100,
  y: 100,
  width: 320,
  height: 200,
  bgColor: 'bg-indigo-50',
}
```

### Change Canvas Size

Update in `src/lib/portfolio-cards.ts`:

```typescript
export const CANVAS_WIDTH = 2400; // e.g., make larger
export const CANVAS_HEIGHT = 1800;
```

### Adjust Auto-Cleanup

Edit `wrangler.toml`:

```toml
crons = ["0 0 1 * *"]  # 1st of month, midnight UTC
```

And `functions/scheduled.ts` for the deletion logic.

## Performance Notes

- **Drawing** is optimized with canvas-based rendering (not individual DOM elements)
- **Transforms** use CSS transforms for 60fps performance
- **Annotations** are polled every 5 seconds (can be tuned in Canvas.tsx)
- **Card dragging** is smooth thanks to Framer Motion

## Troubleshooting

**Canvas not rendering?**
- Check browser console for errors
- Ensure `npm install` completed successfully
- Verify React component is marked as `client:load` in Astro page

**Annotations not persisting?**
- Check D1 database is created and configured in `wrangler.toml`
- Verify API endpoint is accessible at `/api/annotations`
- Check browser Network tab for failed requests

**Drawing looks pixelated?**
- Drawing is intentionally pixel-based for performance
- Adjust `perfect-freehand` settings in `src/lib/drawing.ts` if needed

## License

MIT

---

**Built by Octavius Kim** | [tavi.kim](https://tavi.kim)
