"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileScriptPromise?: Promise<void>;
  }
}

type Props = {
  action: string;
  onToken: (token: string) => void;
  onError?: (message: string) => void;
  className?: string;
};

type WidgetState = "loading" | "awaiting" | "verified" | "expired" | "failed";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 15_000;
const TURNSTILE_ENABLED = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
const TURNSTILE_DISABLED_SENTINEL = "turnstile-temporarily-disabled";
const TURNSTILE_DISABLED_ACTIONS = new Set(["otp_verify", "otp_resend"]);

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileScriptPromise) return window.__turnstileScriptPromise;

  const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_URL}"]`);
  const script = existing ?? document.createElement("script");
  let timer: number | undefined;

  const attempt = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      script.dataset.turnstileLoaded = "true";
      if (window.turnstile) resolve();
      else reject(new Error("Turnstile script loaded without exposing its API."));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Turnstile script failed to load."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Turnstile script load timed out."));
    }, SCRIPT_TIMEOUT_MS);

    if (script.dataset.turnstileLoaded === "true") {
      onLoad();
    } else if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    if (window.__turnstileScriptPromise === attempt) {
      window.__turnstileScriptPromise = undefined;
    }
    // Remove a failed copy so the user initiated retry can make a fresh request.
    if (!window.turnstile) script.remove();
    throw error;
  });

  window.__turnstileScriptPromise = attempt;
  return attempt;
}

export default function TurnstileField({ action, onToken, onError, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const [state, setState] = useState<WidgetState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim();
  const enabledForAction = TURNSTILE_ENABLED && !TURNSTILE_DISABLED_ACTIONS.has(action);

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (enabledForAction) return;
    setState("verified");
    onTokenRef.current(TURNSTILE_DISABLED_SENTINEL);
  }, [enabledForAction]);

  const fail = useCallback((message: string, diagnostic: string) => {
    setState("failed");
    setErrorMessage(message);
    onTokenRef.current("");
    onErrorRef.current?.(message);
    console.warn("Turnstile client event", { action, outcome: diagnostic });
  }, [action]);

  useEffect(() => {
    if (!enabledForAction) return;
    let active = true;
    let widgetId: string | null = null;
    setState("loading");
    setErrorMessage("");
    onTokenRef.current("");

    if (!siteKey || !containerRef.current) return;

    loadTurnstile().then(() => {
      if (!active) return;
      const container = containerRef.current;
      const turnstile = window.turnstile;
      if (!container || !turnstile) {
        fail("Security verification could not start. Please retry.", "api_unavailable_after_load");
        return;
      }

      // The component owns one explicit widget. Clear leftovers defensively before
      // rendering so React Strict Mode and route transitions cannot duplicate it.
      container.replaceChildren();
      try {
        widgetId = turnstile.render(container, {
            sitekey: siteKey,
            action,
            theme: "auto",
            size: "flexible",
            // Managed mode intentionally allows automatic verification. Cloudflare
            // only shows an interactive challenge when its risk signals require one.
            appearance: "interaction-only",
            callback: (token: string) => {
              if (!active || !token) return;
              setState("verified");
              setErrorMessage("");
              onTokenRef.current(token);
            },
            "expired-callback": () => {
              if (!active) return;
              onTokenRef.current("");
              setState("expired");
              setErrorMessage("Security check expired. Please verify again.");
              if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
            },
            "error-callback": (errorCode: unknown) => {
              if (!active) return true;
              const code = typeof errorCode === "string" ? errorCode.slice(0, 40) : "unknown";
              fail("Security verification could not be completed. Please retry.", `widget_error:${code}`);
              return true;
            },
            "timeout-callback": () => {
              if (!active) return;
              onTokenRef.current("");
              setState("expired");
              setErrorMessage("The security check timed out. Please retry.");
              if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
            },
            "unsupported-callback": () => {
              if (active) fail("This browser cannot complete security verification. Try another browser or update this one.", "unsupported_browser");
            },
        });
        widgetIdRef.current = widgetId;
        setState("awaiting");
      } catch {
        fail("Security verification could not start. Please retry.", "widget_initialization_failed");
      }
    }).catch(() => {
      if (active) fail("Security verification could not load. Check your connection and retry.", "script_load_failed");
    });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      if (widgetIdRef.current === widgetId) widgetIdRef.current = null;
    };
  }, [action, enabledForAction, fail, retryVersion, siteKey]);

  const retry = () => {
    const widgetId = widgetIdRef.current;
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
      widgetIdRef.current = null;
    }
    setState("loading");
    setErrorMessage("");
    onTokenRef.current("");
    setRetryVersion((version) => version + 1);
  };

  if (!enabledForAction) {
    return null;
  }

  if (!siteKey) {
    return <p role="alert" className={`text-sm text-red-700 ${className}`}>Security verification is not configured. Please contact support.</p>;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="min-h-0" aria-label="Security verification" />
      {state === "loading" && <p role="status" className="mt-2 text-sm text-muted-foreground">Loading security verification…</p>}
      {state === "expired" && <p role="status" className="mt-2 text-sm text-amber-700">{errorMessage}</p>}
      {state === "failed" && (
        <div role="alert" className="mt-2 text-sm text-red-700">
          <p>{errorMessage}</p>
          <button type="button" onClick={retry} className="mt-1 underline">Retry security check</button>
        </div>
      )}
    </div>
  );
}
