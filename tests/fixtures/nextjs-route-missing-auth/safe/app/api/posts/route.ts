import { db } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  return Response.json(await db.post.findMany());
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = await request.json();
  const post = await db.post.create({ data: { ...body, authorId: data.user.id } });
  return Response.json(post);
}
