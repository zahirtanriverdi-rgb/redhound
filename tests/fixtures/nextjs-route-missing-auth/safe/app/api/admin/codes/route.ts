// The check lives in a helper in the same file.
async function requireOwner() {
  const admin = await getAdminApiUser();
  if (!admin) throw new Response('Not found', { status: 404 });
  return admin;
}

async function rejectMethod() {
  await requireOwner();
  return new Response(null, { status: 405 });
}

export async function PUT() {
  return rejectMethod();
}

export const DELETE = async (request: Request) => {
  await requireOwner();
  return Response.json(await deleteCodes(await request.json()));
};
