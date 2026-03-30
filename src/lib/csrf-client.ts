export async function withCsrfRetry(
  token: string,
  makeRequest: (activeToken: string) => Promise<Response>,
  refreshToken: () => Promise<string | null>
): Promise<Response> {
  let res = await makeRequest(token);
  if (res.status === 403) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await makeRequest(refreshed);
    }
  }
  return res;
}
