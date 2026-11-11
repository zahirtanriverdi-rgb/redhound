export async function POST() {
  // A helper from another file that returns the signed-in user, or a 401 response.
  const auth = await getSupportNoticeUser({ skipPresenceTouch: true });
  if (!auth.ok) return auth.response;
  return Response.json(await markSeen(auth.user.id));
}
