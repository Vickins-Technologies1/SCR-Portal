// app/tenant-login/page.tsx
"use client";

import { Suspense } from "react";
import TenantLoginPage from "./tenant-login-component";

export default function SuspendedTenantLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <TenantLoginPage />
    </Suspense>
  );
}
