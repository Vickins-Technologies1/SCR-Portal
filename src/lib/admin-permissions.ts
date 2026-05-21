export type AdminPermission =
  | "admin:dashboard:view"
  | "admin:properties:view"
  | "admin:properties:edit"
  | "admin:owners:view"
  | "admin:owners:manage"
  | "admin:payments:view"
  | "admin:payments:manage"
  | "admin:invoices:view"
  | "admin:marketplace:view"
  | "admin:airbnb:view"
  | "admin:support:view"
  | "admin:support:respond"
  | "admin:reviews:view"
  | "admin:reviews:moderate"
  | "admin:webhooks:view"
  | "admin:impersonation:manage"
  | "admin:team-members:view"
  | "admin:team-members:manage";

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  "admin:dashboard:view",
  "admin:properties:view",
  "admin:properties:edit",
  "admin:owners:view",
  "admin:owners:manage",
  "admin:payments:view",
  "admin:payments:manage",
  "admin:invoices:view",
  "admin:marketplace:view",
  "admin:airbnb:view",
  "admin:support:view",
  "admin:support:respond",
  "admin:reviews:view",
  "admin:reviews:moderate",
  "admin:webhooks:view",
  "admin:impersonation:manage",
  "admin:team-members:view",
  "admin:team-members:manage",
];

export type AdminPermissionGroup = {
  key: string;
  title: string;
  items: Array<{
    key: AdminPermission;
    label: string;
    description: string;
  }>;
};

export const ADMIN_PERMISSION_GROUPS: AdminPermissionGroup[] = [
  {
    key: "overview",
    title: "Overview",
    items: [
      {
        key: "admin:dashboard:view",
        label: "View dashboard",
        description: "Access KPI cards, approvals, and high-level summaries.",
      },
    ],
  },
  {
    key: "operations",
    title: "Operations",
    items: [
      {
        key: "admin:properties:view",
        label: "View properties",
        description: "See properties, units, and owner/property rollups.",
      },
      {
        key: "admin:properties:edit",
        label: "Edit properties",
        description: "Create/update properties and operational settings.",
      },
      {
        key: "admin:owners:view",
        label: "View property owners",
        description: "See property owner accounts and their status.",
      },
      {
        key: "admin:owners:manage",
        label: "Manage property owners",
        description: "Approve, create, edit, or delete owner accounts.",
      },
      {
        key: "admin:impersonation:manage",
        label: "Impersonate owners",
        description: "Impersonate or revert impersonation for troubleshooting.",
      },
    ],
  },
  {
    key: "billing",
    title: "Billing",
    items: [
      {
        key: "admin:payments:view",
        label: "View payments",
        description: "See payment summaries and recent payment activity.",
      },
      {
        key: "admin:payments:manage",
        label: "Manage payments",
        description: "Perform payment actions and billing workflows.",
      },
      {
        key: "admin:invoices:view",
        label: "View invoices",
        description: "See invoice summaries and recent invoices.",
      },
    ],
  },
  {
    key: "channels",
    title: "Channels",
    items: [
      {
        key: "admin:airbnb:view",
        label: "Airbnb console",
        description: "View Airbnb listings, bookings, messages, payouts, and integrations.",
      },
      {
        key: "admin:marketplace:view",
        label: "Market place",
        description: "Access market place listings and related admin tools.",
      },
      {
        key: "admin:webhooks:view",
        label: "Webhooks",
        description: "View webhook activity (Tuma, etc).",
      },
    ],
  },
  {
    key: "support",
    title: "Support & Trust",
    items: [
      {
        key: "admin:support:view",
        label: "View support",
        description: "Access support inbox and message threads.",
      },
      {
        key: "admin:support:respond",
        label: "Respond to support",
        description: "Send replies and manage support conversations.",
      },
      {
        key: "admin:reviews:view",
        label: "View reviews",
        description: "Access property / listing reviews.",
      },
      {
        key: "admin:reviews:moderate",
        label: "Moderate reviews",
        description: "Approve or reject reviews.",
      },
    ],
  },
  {
    key: "security",
    title: "Security",
    items: [
      {
        key: "admin:team-members:view",
        label: "View team members",
        description: "View internal staff accounts and access profiles.",
      },
      {
        key: "admin:team-members:manage",
        label: "Manage team members",
        description: "Create, edit, disable, and reset staff access.",
      },
    ],
  },
];

export const ADMIN_ROLE_PRESETS: Record<string, AdminPermission[]> = {
  "Operations": [
    "admin:dashboard:view",
    "admin:properties:view",
    "admin:properties:edit",
    "admin:owners:view",
    "admin:owners:manage",
    "admin:airbnb:view",
    "admin:marketplace:view",
  ],
  "Finance": [
    "admin:dashboard:view",
    "admin:payments:view",
    "admin:payments:manage",
    "admin:invoices:view",
    "admin:owners:view",
  ],
  "Support": [
    "admin:dashboard:view",
    "admin:support:view",
    "admin:support:respond",
    "admin:reviews:view",
    "admin:reviews:moderate",
  ],
  "Auditor (Read-only)": [
    "admin:dashboard:view",
    "admin:properties:view",
    "admin:owners:view",
    "admin:payments:view",
    "admin:invoices:view",
    "admin:airbnb:view",
    "admin:marketplace:view",
    "admin:support:view",
    "admin:reviews:view",
    "admin:webhooks:view",
  ],
  "Custom": [
    "admin:dashboard:view",
  ],
};

export function normalizeAdminPermissions(input: unknown): AdminPermission[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(ALL_ADMIN_PERMISSIONS);
  const result: AdminPermission[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    if (!allowed.has(item)) continue;
    result.push(item as AdminPermission);
  }
  return Array.from(new Set(result));
}

export function getAdminRolePreset(roleName: string): AdminPermission[] {
  return ADMIN_ROLE_PRESETS[roleName] ?? ADMIN_ROLE_PRESETS["Custom"] ?? [];
}

export function getAdminPermissionFeatureKey(permission: AdminPermission): string {
  const parts = permission.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : permission;
}

// Feature-level matching: any permission under the same feature key (e.g. "admin:support:*")
// grants full access to that feature.
export function adminPermissionsCover(required: AdminPermission, granted: AdminPermission[]): boolean {
  const requiredKey = getAdminPermissionFeatureKey(required);
  return granted.some((perm) => getAdminPermissionFeatureKey(perm) === requiredKey);
}
