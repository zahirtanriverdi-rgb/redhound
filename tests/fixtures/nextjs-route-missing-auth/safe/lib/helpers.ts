// Not a route file: an exported function named POST here is not an HTTP handler.
export async function POST(payload: unknown) {
  return JSON.stringify(payload);
}
