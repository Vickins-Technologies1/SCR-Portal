export async function onRequestError(error: unknown, request: unknown, context: unknown) {
  const req = request as { url?: string; method?: string; headers?: Headers };
  const url = req.url || "";
  const headers = req.headers;
  const ctx = context as { routerKind?: string; routePath?: string; routeType?: string } | undefined;
  if (!url) return;
  void fetch(new URL("/api/system-errors/ingest", url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-sorana-monitor-key": process.env.ERROR_MONITOR_INTERNAL_KEY || "" },
    body: JSON.stringify({
      message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined,
      route: ctx?.routePath || new URL(url).pathname, endpoint: new URL(url).pathname, method: req.method,
      requestId: headers?.get("x-request-id"), userAgent: headers?.get("user-agent"), metadata: { routerKind: ctx?.routerKind, routeType: ctx?.routeType },
    }),
  }).catch(() => undefined);
}
