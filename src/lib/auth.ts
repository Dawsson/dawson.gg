/** Check API auth from Authorization header or ?token= query param. */
export function checkAuth(request: Request, apiToken: string): boolean {
  const header = request.headers.get("Authorization");
  const url = new URL(request.url);
  const query = url.searchParams.get("token");
  return header === `Bearer ${apiToken}` || query === apiToken;
}
