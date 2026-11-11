export async function POST(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  return Response.json(await redeem(user.id, await request.json()));
}
