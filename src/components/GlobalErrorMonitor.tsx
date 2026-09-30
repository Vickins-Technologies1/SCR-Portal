"use client";

import { useEffect } from "react";

export default function GlobalErrorMonitor() {
  useEffect(() => {
    const report = (payload: Record<string, unknown>) => {
      fetch("/api/system-errors/client", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => undefined);
    };
    const onError = (event: ErrorEvent) => report({ message: event.message, stack: event.error?.stack, route: window.location.pathname, metadata: { source: event.filename, line: event.lineno, column: event.colno, userAgent: navigator.userAgent } });
    const onRejection = (event: PromiseRejectionEvent) => report({ message: event.reason instanceof Error ? event.reason.message : String(event.reason), stack: event.reason instanceof Error ? event.reason.stack : undefined, route: window.location.pathname, metadata: { userAgent: navigator.userAgent } });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
