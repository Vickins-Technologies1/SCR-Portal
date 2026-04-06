async function handleCsrfLogout(res: Response) {
  if (res.status !== 403) return false;

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return false;

  try {
    const data = await res.clone().json();
    if (data?.logout && data?.redirect && typeof window !== "undefined") {
      const { default: toast } = await import("react-hot-toast");
      toast.error("Your session expired. Please sign in again.");
      window.setTimeout(() => {
        window.location.href = data.redirect;
      }, 800);
      return true;
    }
  } catch {
    // Ignore JSON parsing errors and fall through.
  }

  return false;
}

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

  await handleCsrfLogout(res);
  return res;
}
