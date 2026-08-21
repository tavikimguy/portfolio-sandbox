# Quick Start Guide

## Step 1: Initialize Git (if you haven't already)

```bash
cd portfolio-sandbox
git init
git config user.name "Octavius Kim"
git config user.email "tavikim2001@gmail.com"
```

Verify:
```bash
git config user.name  # should show "Octavius Kim"
git config user.email # should show "tavikim2001@gmail.com"
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Set Up Cloudflare (for backend)

### Option A: Local Development Only

Skip this for now. Just run:

```bash
npm run dev
```

This will run the frontend locally without the backend. Annotations will be stored in localStorage.

### Option B: Full Setup with D1

1. **Create a Cloudflare account** at [cloudflare.com](https://cloudflare.com)

2. **Authenticate Wrangler:**
   ```bash
   npx wrangler login
   ```

3. **Create D1 database:**
   ```bash
   npx wrangler d1 create portfolio_db
   ```

4. **Update `wrangler.toml`** with the database ID from the previous command

5. **Create local database:**
   ```bash
   npx wrangler d1 execute portfolio_db --file migrations/0001_init.sql --local
   ```

6. **Run dev server:**
   ```bash
   npm run dev
   ```

## Step 4: Test the Canvas

Open `http://localhost:3000` and try:
- **Dragging cards** (click and drag any portfolio card)
- **Drawing** (click the Pen tool in toolbar, draw on canvas)
- **Comments** (click the Comment tool, click canvas to add a note)
- **Erasing** (click Eraser tool)
- **Undo/Redo** (buttons in toolbar)
- **Zooming** (Ctrl + Scroll)

## Step 5: Deploy to Cloudflare (optional)

When ready to go live:

```bash
npm run build
npm run deploy
```

Then run migrations on production:
```bash
npm run db:migrations
```

## What's Not Yet Done

These are intentionally left for you to customize:

- [ ] Add portfolio card images/links
- [ ] Custom styling for cards
- [ ] User authentication (if you want per-user comments)
- [ ] Real-time collaboration (WebSocket via Durable Objects)
- [ ] Analytics integration

## Troubleshooting

**Port 3000 already in use?**
```bash
npm run dev -- --port 3001
```

**Canvas looks small/wrong size?**
Check `src/lib/portfolio-cards.ts` for CANVAS_WIDTH/CANVAS_HEIGHT

**Annotations not saving?**
- Local dev: Check browser console, should see POST to `/api/annotations`
- Production: Verify D1 database is created and migrations ran

## Next Steps

1. **Customize portfolio cards** in `src/lib/portfolio-cards.ts`
2. **Add images** to cards (update Card.tsx component)
3. **Deploy to Cloudflare** when ready
4. **Add custom domain** (tavi.kim) in Cloudflare dashboard
5. **Monitor usage** via Cloudflare Analytics

---

Questions? Check the full README.md for more details.
