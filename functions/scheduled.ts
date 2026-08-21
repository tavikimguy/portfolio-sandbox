import type { ScheduledEvent } from '@cloudflare/workers-types';

export async function onScheduled(event: ScheduledEvent, env: any, ctx: any) {
  // Monthly wipe - runs on 1st of each month at 00:00 UTC
  const db = env.DB as D1Database;

  try {
    // Delete all annotations older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const result = await db
      .prepare('DELETE FROM annotations WHERE createdAt < ?')
      .bind(thirtyDaysAgo)
      .run();

    console.log(`Cleaned up ${result.meta.changes} old annotations`);
  } catch (error) {
    console.error('Error in scheduled cleanup:', error);
    throw error;
  }
}
