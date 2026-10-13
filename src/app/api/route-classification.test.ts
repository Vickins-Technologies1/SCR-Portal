import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// New API root namespaces must be deliberately classified here. Routes inherit
// their root class and must still enforce the matching server-side guard.
const API_ROOT_CLASS: Record<string, string> = {
  account: "session", admin: "admin", airbnb: "session", "airbnb-tenant": "session",
  auth: "authentication", cron: "cron-secret", "csrf-token": "csrf-bootstrap",
  devices: "session", expenses: "session", "fix-property-units": "admin-or-owner",
  "generate-excel": "session", impersonate: "owner-impersonation", invoices: "session",
  kopokopo: "signed-provider-callback", lifetime: "session", "list-properties": "owner",
  mpesa: "provider-callback-or-session", notifications: "session", "owner-dues": "owner",
  owner: "owner-or-provider-callback", ownercharts: "owner", ownerstats: "owner",
  payments: "session", "pending-invoices": "owner", properties: "session",
  "property-charts": "owner", "property-owner-data": "owner", "property-owners": "owner",
  "public-bookings": "public-input-validation", "public-properties": "public-read",
  public: "public-input-validation", referrals: "session", "rent-price-overrides": "owner",
  reports: "session", "revert-impersonation": "impersonation-session-transition", settings: "owner", signin: "authentication", signout: "session-transition",
  signup: "authentication", stripe: "signed-provider-callback", support: "session",
  "system-errors": "ingest-or-admin", "team-members": "owner", tenant: "tenant",
  tenants: "owner-or-tenant", "transaction-status": "session", tuma: "held-unverified-provider-callback",
  "update-wallet": "owner", upload: "session", user: "session", "utility-charges": "owner",
};

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    return statSync(fullPath).isDirectory()
      ? routeFiles(fullPath)
      : entry === "route.ts" ? [fullPath] : [];
  });
}

describe("API route classification", () => {
  it("classifies every API route namespace", () => {
    const apiDirectory = path.join(process.cwd(), "src", "app", "api");
    const roots = new Set(routeFiles(apiDirectory).map((file) => path.relative(apiDirectory, file).split(path.sep)[0]));
    const unclassified = [...roots].filter((root) => !API_ROOT_CLASS[root]);
    expect(unclassified).toEqual([]);
  });
});
