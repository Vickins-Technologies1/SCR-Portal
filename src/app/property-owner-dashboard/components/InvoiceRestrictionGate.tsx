"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";

type DueStatus = {
  isDue: boolean;
};

function getOwnerDashboardBasePath(): "/property-owner-dashboard" | "/airbnb-dashboard" {
  return Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
}

export default function InvoiceRestrictionGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [dueStatus, setDueStatus] = useState<DueStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const basePath = useMemo(() => getOwnerDashboardBasePath(), []);
  const allowedPaths = useMemo(() => [basePath, `${basePath}/reports`, `${basePath}/properties-report`], [basePath]);

  useEffect(() => {
    const userId = Cookies.get("userId");
    const role = Cookies.get("role");

    if (!userId || !["propertyOwner", "teamMember"].includes(role ?? "")) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    const fetchDueStatus = async () => {
      try {
        const res = await fetch("/api/owner-dues", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && data?.success) {
          setDueStatus({ isDue: !!data.isDue });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setChecked(true);
      }
    };

    fetchDueStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!checked || !dueStatus?.isDue) return;
    const isAllowed = allowedPaths.some((base) => pathname === base || pathname.startsWith(base + "/"));
    if (!isAllowed) {
      router.replace(basePath);
    }
  }, [checked, dueStatus, pathname, router, basePath, allowedPaths]);

  return null;
}
