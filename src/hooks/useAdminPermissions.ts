"use client";

import { useMemo } from "react";
import Cookies from "js-cookie";
import { adminPermissionsCover, normalizeAdminPermissions, type AdminPermission } from "@/lib/admin-permissions";

export function useAdminPermissions() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        role: null as string | null,
        isAdminOwner: false,
        permissions: [] as AdminPermission[],
        hasPermission: () => false,
      };
    }

    const role = Cookies.get("role") ?? null;
    const isAdminOwner = role === "admin";

    const permsRaw = Cookies.get("permissions");
    let permissions: AdminPermission[] = [];
    if (permsRaw) {
      try {
        permissions = normalizeAdminPermissions(JSON.parse(permsRaw));
      } catch {
        permissions = [];
      }
    }

    const hasPermission = (perm: AdminPermission) => isAdminOwner || adminPermissionsCover(perm, permissions);

    return { role, isAdminOwner, permissions, hasPermission };
  }, []);
}
