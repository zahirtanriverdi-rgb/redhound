import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const accessToken = (await cookies()).get('medplum_access_token')?.value;
  if (!accessToken) return new Response('Session expired', { status: 401 });
  return Response.json(await chat(accessToken, await req.json()));
}
