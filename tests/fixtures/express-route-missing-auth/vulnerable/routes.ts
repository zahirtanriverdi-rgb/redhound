import { Router } from 'express';
import { authenticateUser } from './auth';
import { db } from './db';

export const router = Router();

router.get('/api/products', async (_req, res) => {
  res.json(await db.product.findMany());
});

router.post('/api/products', async (req, res) => {
  res.json(await db.product.create({ data: req.body }));
});

router.delete('/api/products/:id', requireEnabled, async (req, res) => {
  await db.product.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
});

router.patch('/api/orders/:id', authenticateUser, async (req, res) => {
  res.json(await db.order.update({ where: { id: req.params.id }, data: req.body }));
});
