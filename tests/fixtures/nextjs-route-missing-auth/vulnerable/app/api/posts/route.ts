import { db } from '@/lib/db';

export async function GET() {
  return Response.json(await db.post.findMany());
}

export async function POST(request: Request) {
  const body = await request.json();
  const post = await db.post.create({ data: body });
  return Response.json(post);
}

export const DELETE = async (request: Request) => {
  const { id } = await request.json();
  await db.post.delete({ where: { id } });
  return new Response(null, { status: 204 });
};
