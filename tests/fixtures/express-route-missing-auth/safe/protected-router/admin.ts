import { Router } from 'express';
import { requireAdmin } from '../auth';

export const admin = Router();
admin.use(requireAdmin);

admin.delete('/users/:id', async (req, res) => {
  res.sendStatus(204);
});
