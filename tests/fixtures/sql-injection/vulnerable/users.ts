import { Router } from 'express';
import { db, pool } from './db';

export const router = Router();

router.get('/api/users', async (req, res) => {
  const { sort } = req.query;
  const result = await pool.query(`SELECT id, name FROM users ORDER BY ${sort}`);
  res.json(result.rows);
});

router.post('/api/login', async (req, res) => {
  const sql = "SELECT * FROM users WHERE email = '" + req.body.email + "'";
  const user = await db.get(sql);
  res.json({ ok: Boolean(user) });
});

// A helper that passes its argument straight into the SQL text.
router.get('/api/by-column', async (req, res) => {
  const where = (column: string) => `${column} = 1`;
  res.json(await db.query(`SELECT * FROM users WHERE ${where(String(req.query.column))}`));
});
