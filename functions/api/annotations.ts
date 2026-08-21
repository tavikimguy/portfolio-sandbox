import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Annotation } from '../../src/stores/canvas';

export const annotations = new Hono<{
  Bindings: {
    DB: D1Database;
  };
}>();

// GET /api/annotations - Fetch all annotations
annotations.get('/', async (c) => {
  const db = c.env.DB;

  try {
    // Chronological (oldest first) — the client redraws annotations in
    // array order, and an eraser stroke needs to be replayed *after* the
    // strokes it punched through, or it erases nothing on a blank canvas
    // and everything drawn before it lands back on top when this list
    // round-trips through a refetch.
    // createdAt only has second-level precision, so two strokes made in
    // the same second (e.g. draw, then immediately erase part of it) can
    // tie — rowid (SQLite's implicit insertion-order column) breaks the
    // tie reliably, even though id itself is a TEXT primary key.
    const result = await db
      .prepare('SELECT * FROM annotations ORDER BY createdAt ASC, rowid ASC LIMIT 1000')
      .all<any>();

    const annotations: Annotation[] = result.results?.map((row) => ({
      ...JSON.parse(row.payload),
      id: row.id,
    })) || [];

    return c.json({ annotations });
  } catch (error) {
    console.error('Error fetching annotations:', error);
    return c.json({ error: 'Failed to fetch annotations' }, 500);
  }
});

// POST /api/annotations - Create a new annotation
annotations.post('/', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json<Annotation>();

  if (!body.type || !body.id) {
    return c.json({ error: 'Invalid annotation format' }, 400);
  }

  try {
    const id = body.id || nanoid();
    await db
      .prepare(
        'INSERT INTO annotations (id, type, payload, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
      )
      .bind(id, body.type, JSON.stringify(body))
      .run();

    return c.json({ ...body, id }, 201);
  } catch (error) {
    console.error('Error creating annotation:', error);
    return c.json({ error: 'Failed to create annotation' }, 500);
  }
});

// DELETE /api/annotations/:id - Delete an annotation
annotations.delete('/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    await db.prepare('DELETE FROM annotations WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting annotation:', error);
    return c.json({ error: 'Failed to delete annotation' }, 500);
  }
});
