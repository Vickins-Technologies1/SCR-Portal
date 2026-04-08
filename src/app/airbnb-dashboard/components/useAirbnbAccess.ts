"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { usePermissions } from "@/hooks/usePermissions";

type AccessState = {
  userId: string | null;
  role: string | null;
  ownerId: string | null;
  hasAccess: boolean | null;
  csrfToken: string | null;
};

export function useAirbnbAccess(requiredPermission: string) {
  const router = useRouter();
  const perm = usePermissions();
  const [state, setState] = useState<AccessState>({
    userId: null,
    role: null,
    ownerId: null,
    hasAccess: null,
    csrfToken: null,
  });

  useEffect(() => {
    const userId = Cookies.get("userId") ?? null;
    const role = Cookies.get("role") ?? null;
    const ownerId = Cookies.get("ownerId") ?? userId;

    if (!userId || !["propertyOwner", "teamMember"].includes(role ?? "")) {
      router.replace("/");
      return;
    }

    const allowed = role === "propertyOwner" || perm.hasPermission(requiredPermission);

    setState((prev) => ({
      ...prev,
      userId,
      role,
      ownerId,
      hasAccess: allowed,
    }));

    if (!allowed) {
      return;
    }

    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/" });
            token = data.csrfToken;
          }
        } catch {
          // ignore
        }
      }
      setState((prev) => ({ ...prev, csrfToken: token || null }));
    };

    fetchCsrf();
  }, [router, perm, requiredPermission]);

  return state;
}
