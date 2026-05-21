"use client";

import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <main className="min-h-[100svh] flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to access this page. If you believe this is a mistake, ask an admin to update
          your permissions.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => router.replace("/admin/dashboard")}
          >
            Go to dashboard
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium"
            onClick={() => router.back()}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}

