"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminAirbnbOverviewRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div aria-hidden="true" className="loading-skeleton h-4 w-28 rounded-md" />
        <p className="text-lg font-medium text-muted-foreground">Redirecting to overview...</p>
      </div>
    </div>
  );
}
