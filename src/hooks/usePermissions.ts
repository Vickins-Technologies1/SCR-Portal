"use client";

import { useMemo } from "react";
import Cookies from "js-cookie";

export function usePermissions() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        isOwner: false,
        permissions: [] as string[],
        hasPermission: () => false,
        canViewDashboard: false,
        canViewProperties: false,
        canViewTenants: false,
        canViewUsers: false,
        canViewPayments: false,
        canViewExpenses: false,
        canViewNotifications: false,
        canViewReports: false,
        canViewSettings: false,
        canListProperties: false,
      };
    }

    const role = Cookies.get("role") ?? null;
    const permsRaw = Cookies.get("permissions");
    const permissions: string[] = permsRaw ? JSON.parse(permsRaw) : [];

    const isOwner = role === "propertyOwner";

    const hasPermission = (perm: string) => isOwner || permissions.includes(perm);

    return {
      isOwner,
      permissions,
      hasPermission,
      canViewDashboard: hasPermission("dashboard:view"),
      canViewProperties: hasPermission("properties:view"),
      canViewTenants: hasPermission("tenants:view"),
      canViewUsers: hasPermission("users:view"),
      canViewPayments: hasPermission("payments:view"),
      canViewExpenses: hasPermission("expenses:view"),
      canViewNotifications: hasPermission("notifications:view"),
      canViewReports: hasPermission("reports:view"),
      canViewSettings: hasPermission("settings:view"),
      canListProperties: hasPermission("properties:list_new"),
    };
  }, []);
}