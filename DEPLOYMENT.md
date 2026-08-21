# Deployment Checklist

## Pre-Deployment

- [ ] Test locally with `npm run dev`
- [ ] Verify all drawing tools work (pen, eraser, comment)
- [ ] Test undo/redo
- [ ] Check portfolio card content is correct
- [ ] Ensure no console errors in browser DevTools
- [ ] Run `npm run build` and verify no errors
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile (responsive?)

## Cloudflare Setup

- [ ] Create Cloudflare account at https://dash.cloudflare.com
- [ ] Verify domain is pointing to Cloudflare (tavi.kim)
- [ ] Create D1 database: `npx wrangler d1 create portfolio_db`
- [ ] Update `wrangler.toml` with database ID
- [ ] Verify Wrangler is authenticated: `npx wrangler whoami`

## Deployment

```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages + Workers
npm run deploy

# Run database migrations
npm run db:migrations

# Verify deployment
npx wrangler tail  # View logs
```

## Post-Deployment

- [ ] Visit production URL and test drawing
- [ ] Verify annotations persist (refresh page)
- [ ] Check that multiple users see same annotations
- [ ] Monitor Cloudflare Analytics dashboard
- [ ] Set up error tracking (optional: Sentry, Axiom)
- [ ] Monitor D1 database usage in Cloudflare dashboard

## Custom Domain Setup

1. In Cloudflare dashboard:
   - Go to Pages > portfolio-sandbox
   - Settings > Domains & redirects
   - Add custom domain: `tavi.kim`
   - Verify DNS records point to Cloudflare

2. Update wrangler.toml if needed:
   ```toml
   route = "tavi.kim/*"
   zone_id = "your_zone_id"
   ```

## Environment Variables

If you need environment variables in production:

```bash
# Set in Cloudflare Workers environment
wrangler secret put VARIABLE_NAME
```

Then access in functions via `env.VARIABLE_NAME`

## Rollback

If something breaks in production:

```bash
# View deployment history
wrangler deployments list

# Rollback to previous version
wrangler rollback
```

## Performance Optimization

- Canvas polling interval: Currently 5s, can reduce if needed (check `Canvas.tsx`)
- D1 query indexes: Already set up for fast lookups
- Consider adding CDN caching for static assets

## Monitoring

Set up alerts for:
- High error rates in Workers
- D1 database quota usage
- Unusual annotation volume

## Maintenance

### Monthly Cleanup

Scheduled event runs on 1st of month at 00:00 UTC:
- Automatically deletes annotations older than 30 days
- Configured in `wrangler.toml` and `functions/scheduled.ts`

To adjust:
```toml
# In wrangler.toml
[triggers]
crons = ["0 0 1 * *"]  # Change cron schedule
```

### Monitoring D1

```bash
# Check database size
wrangler d1 info portfolio_db

# Query annotations directly
wrangler d1 execute portfolio_db --command "SELECT COUNT(*) FROM annotations"
```

## Troubleshooting Deployment

**Pages build fails**
- Check `npm run build` locally first
- Look at build logs in Cloudflare dashboard
- Verify `astro.config.mjs` is correct

**Workers 503 errors**
- Check function logs: `wrangler tail`
- Verify D1 database ID in `wrangler.toml`
- Test API locally first

**D1 connection errors**
- Verify database exists: `wrangler d1 list`
- Run migrations: `npm run db:migrations`
- Check database permissions in Cloudflare dashboard

**Annotations not persisting**
- Verify POST request reaches `/api/annotations`
- Check D1 database has data: `wrangler d1 execute portfolio_db --command "SELECT * FROM annotations LIMIT 1"`
- Look at browser Network tab for failed requests

## Cost Estimation

Cloudflare free tier includes:
- ✅ Unlimited Pages requests
- ✅ 100,000 Workers requests/day free
- ✅ D1 database (limited storage on free tier)

For more details, see https://developers.cloudflare.com/workers/platform/pricing/

---

**Note:** You have full control of your git repo at Octavius Kim's email. Keep `wrangler.toml` secrets safe (don't commit API tokens).
