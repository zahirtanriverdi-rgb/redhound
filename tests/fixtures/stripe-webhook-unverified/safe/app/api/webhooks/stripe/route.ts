import Stripe from 'stripe';
import { db } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  if (event.type === 'checkout.session.completed') {
    const userId = event.data.object.client_reference_id;
    await db.user.update({ where: { id: userId! }, data: { plan: 'pro' } });
  }
  return Response.json({ received: true });
}
