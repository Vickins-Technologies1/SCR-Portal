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
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary" />
        <p className="text-lg font-medium text-muted-foreground">Redirecting to overview...</p>
      </div>
    </div>
  );
}
