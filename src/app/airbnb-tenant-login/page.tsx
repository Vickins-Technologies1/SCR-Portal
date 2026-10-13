// src/app/airbnb-tenant-login/page.tsx
"use client";

import { Suspense } from "react";
import TenantLoginPage from "../tenant-login/tenant-login-component";
import { AuthLoadingFallback } from "@/components/ui/LoadingSkeletons";

export default function SuspendedAirbnbTenantLoginPage() {
  return (
    <Suspense fallback={<AuthLoadingFallback />}>
      <TenantLoginPage variant="airbnb" />
    </Suspense>
  );
}

