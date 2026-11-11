// Signing in creates the session, so it cannot require one.
export async function POST(request: Request) {
  const { email, password } = await request.json();
  return Response.json(await signIn(email, password));
}
