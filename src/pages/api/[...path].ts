import type { APIRoute } from 'astro';
import app from '../../../functions/_app';

// Catch-all bridge: forwards every /api/* request to the Hono app in
// functions/_app.ts, giving it the D1 binding via Astro's Cloudflare runtime.
export const ALL: APIRoute = (context) => {
  return app.fetch(context.request, context.locals.runtime.env, context.locals.runtime.ctx);
};
