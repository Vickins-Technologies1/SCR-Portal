// app/tenant-login/page.tsx
"use client";

import { Suspense } from "react";
import TenantLoginPage from "./tenant-login-component";
import { AuthLoadingFallback } from "@/components/ui/LoadingSkeletons";

export default function SuspendedTenantLoginPage() {
  return (
    <Suspense fallback={<AuthLoadingFallback />}>
      <TenantLoginPage />
    </Suspense>
  );
}
