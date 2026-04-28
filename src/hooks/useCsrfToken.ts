"use client";

import { useCallback, useEffect, useState } from "react";
import Cookies from "js-cookie";

export function useCsrfToken() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const ensureCsrf = useCallback(async () => {
    let token = Cookies.get("csrf-token");
    if (!token) {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const json = await res.json();
        if (json?.csrfToken) {
          Cookies.set("csrf-token", json.csrfToken, { sameSite: "strict", path: "/" });
          token = json.csrfToken;
        }
      } catch {
        // ignore
      }
    }

    setCsrfToken(token || null);
    return token || null;
  }, []);

  useEffect(() => {
    ensureCsrf();
  }, [ensureCsrf]);

  return { csrfToken, ensureCsrf };
}

