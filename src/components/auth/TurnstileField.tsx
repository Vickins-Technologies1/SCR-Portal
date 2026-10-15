"use client";

import { useEffect, useRef, useState } from "react";

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

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileScriptPromise) return window.__turnstileScriptPromise;
  window.__turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Security verification could not load."));
    document.head.appendChild(script);
  });
  return window.__turnstileScriptPromise;
}

export default function TurnstileField({ action, onToken, onError, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const [loadError, setLoadError] = useState("");
  const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let active = true;
    if (!siteKey || !containerRef.current) return;

    loadTurnstile().then(() => {
      if (!active || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "auto",
        size: "flexible",
        appearance: "interaction-only",
        callback: (token: string) => {
          setLoadError("");
          onTokenRef.current(token);
        },
        "expired-callback": () => {
          onTokenRef.current("");
          onErrorRef.current?.("Security check expired. Please verify again.");
        },
        "error-callback": () => {
          onTokenRef.current("");
          setLoadError("Security verification could not be completed. Please retry.");
          onErrorRef.current?.("Security verification could not be completed. Please retry.");
          return true;
        },
      });
    }).catch(() => {
      if (!active) return;
      setLoadError("Security verification could not load. Check your connection and retry.");
      onTokenRef.current("");
      onErrorRef.current?.("Security verification could not load. Check your connection and retry.");
    });

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, siteKey]);

  if (!siteKey) {
    return <p role="alert" className={`text-sm text-red-700 ${className}`}>Security verification is not configured. Please contact support.</p>;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="min-h-0" aria-label="Security verification" />
      {loadError && <p role="alert" className="mt-2 text-sm text-red-700">{loadError}</p>}
    </div>
  );
}
