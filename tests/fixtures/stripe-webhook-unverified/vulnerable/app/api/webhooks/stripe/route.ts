import { db } from '@/lib/db';

export async function POST(request: Request) {
  const event = await request.json();

  if (event.type === 'checkout.session.completed') {
    const userId = event.data.object.client_reference_id;
    await db.user.update({ where: { id: userId }, data: { plan: 'pro' } });
  }
  return Response.json({ received: true });
}
