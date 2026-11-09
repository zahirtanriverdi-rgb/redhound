import { withAuth } from '@/lib/auth';
import { db } from '@/lib/db';

export const POST = withAuth(async (request: Request) => {
  const body = await request.json();
  return Response.json(await db.setting.create({ data: body }));
});
