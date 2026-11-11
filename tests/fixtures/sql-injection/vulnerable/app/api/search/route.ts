import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get('q') ?? '';
  const posts = await prisma.$queryRawUnsafe(
    `SELECT * FROM posts WHERE title LIKE '%${term}%'`,
  );
  return Response.json(posts);
}
