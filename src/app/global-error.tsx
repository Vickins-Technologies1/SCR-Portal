"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { fetch("/api/system-errors/client", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message, stack: error.stack, route: window.location.pathname, metadata: { digest: error.digest } }), keepalive: true }).catch(() => undefined); }, [error]);
  return <html><body><main style={{ fontFamily: "sans-serif", padding: 40 }}><h1>Something went wrong</h1><p>We’re sorry — Sorana could not complete that request.</p><button onClick={() => reset()}>Try again</button></main></body></html>;
}
