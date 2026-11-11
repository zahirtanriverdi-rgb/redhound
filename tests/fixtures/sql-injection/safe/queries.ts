import { Router } from 'express';
import { db, pool, prisma } from './db';

export const router = Router();
const TABLE = 'users';
const cache = new Map<string, unknown>();

router.get('/api/users/:id', async (req, res) => {
  // Values are passed as parameters, never written into the SQL text.
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const row = await db.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [req.params.id]);
  res.json({ user, row });
});

router.post('/api/users/batch', async (req, res) => {
  const ids: string[] = req.body.ids;
  // Only the placeholders are interpolated: one "?" per id.
  const rows = await db.query(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  res.json(rows);
});

router.get('/api/posts', async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const direction = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.query(`SELECT * FROM posts ORDER BY created_at ${direction} LIMIT ${limit}`);
  res.json(rows);
});

router.get('/api/posts/:id', async (req, res) => {
  // Tagged templates turn interpolations into parameters.
  const post = await prisma.$queryRaw`SELECT * FROM posts WHERE id = ${req.params.id}`;
  // Not SQL at all, despite the method name.
  res.json({ post, cached: cache.get(String(req.query.key)) });
});

// Allow-lists: the input only picks a value the server wrote.
const SORT_COLUMNS: Record<string, string> = { added: 'created_at', name: 'name' };
const EDITABLE = { displayName: 'display_name', bio: 'bio' };

router.get('/api/people', async (req, res) => {
  const sortCol = SORT_COLUMNS[String(req.query.sort)] || 'created_at';
  res.json(await db.query(`SELECT * FROM people ORDER BY ${sortCol}`));
});

router.patch('/api/me', async (req, res) => {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [field, column] of Object.entries(EDITABLE)) {
    if (req.body[field] === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(req.body[field]);
  }
  const values = { title: req.body.title, price: Number(req.body.price) };
  await db.execute(`UPDATE people SET ${sets.join(', ')} WHERE id = ?`, params);
  await db.execute(`UPDATE items SET ${Object.keys(values).map((k) => `${k} = ?`).join(', ')}`, Object.values(values));
  res.sendStatus(204);
});

// A local helper and a same-named variable elsewhere that does carry input.
router.get('/api/feed', async (req, res) => {
  const marks = (n: number) => Array(n).fill('?').join(',');
  const friendIds: string[] = await loadFriendIds();
  res.json(await db.query(`SELECT * FROM posts WHERE author_id IN (${marks(friendIds.length)})`, friendIds));
});
router.get('/api/other', async (req, res) => {
  const n = req.query.n;
  res.json({ n });
});
