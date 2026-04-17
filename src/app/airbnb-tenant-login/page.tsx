// src/app/airbnb-tenant-login/page.tsx
"use client";

import { Suspense } from "react";
import TenantLoginPage from "../tenant-login/tenant-login-component";

export default function SuspendedAirbnbTenantLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <TenantLoginPage variant="airbnb" />
    </Suspense>
  );
}

