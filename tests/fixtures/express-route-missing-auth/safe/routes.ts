import { Router } from 'express';
import passport from 'passport';
import { authenticateUser, requireShop } from './auth';

export const router = Router();

router.post('/api/shop/products', authenticateUser, requireShop('product:write'), async (req, res) => {
  res.json(await createProduct(req.body));
});

router.delete('/api/posts/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  res.sendStatus(204);
});

router.patch('/api/me', async (req: any, res) => {
  if (!req.user) return res.sendStatus(401);
  res.json(await updateProfile(req.user.id, req.body));
});

// Public by design: sign-in, sign-up and one-time codes cannot require a session.
router.post('/api/auth/login', async (req, res) => {
  res.json(await login(req.body));
});
router.post('/api/register', async (req, res) => {
  res.json(await register(req.body));
});
router.post('/api/otp/send', async (req, res) => {
  res.json(await sendOtp(req.body.phone));
});

// The handler is defined elsewhere, so the rule cannot see inside it.
router.post('/api/newsletter/subscribe', subscribe);

// Middleware spread from an array, and identity stored under a project-specific name.
const writeGuard = [authenticateUser, requireShop('board:write')];
router.put('/api/board/reserve', ...writeGuard, async (req, res) => {
  res.json(await reserve(req.body));
});
router.post('/api/collections', async (req: any, res) => {
  if (req.operator.role !== 'customer') return res.sendStatus(403);
  res.json(await createCollection(req.operator.id, req.body));
});

// Checks done by helpers whose names show they look at the caller.
router.post('/api/tickets', async (req, res) => {
  const operator = getOptionalUser(req);
  if (!operator) return res.sendStatus(403);
  res.json(await issueTicket(req.body));
});
router.post('/api/bonus/history', async (req, res) => {
  if (!(await loggedInCustomerOwnsPhone(req, req.body.phone))) return res.sendStatus(403);
  res.json(await bonusHistory(req.body.phone));
});

router.post('/api/ops/recompute', async (req: any, res) => {
  if (!can(req.person, 'staff')) return res.sendStatus(403);
  res.json(await recompute());
});
