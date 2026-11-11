// Looking up some user by id is not the same as checking who is calling.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  await deleteUser(user.id);
  return new Response(null, { status: 204 });
}
