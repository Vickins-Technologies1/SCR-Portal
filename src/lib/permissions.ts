// src/lib/permissions.ts
export const getDefaultPermissions = (role: string, isTeamMember: boolean = false): string[] => {
  const common = [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "payments:view",
    "expenses:view",
    "notifications:view",
    "reports:view",
    "integrations:view",
    "settings:view",
  ];

  if (role === "propertyOwner") {
    return [
      ...common,
      "users:view",
      "properties:list_new",
    ];
  }

  if (isTeamMember) {
    return [
      ...common,
      "users:view",
      "properties:list_new",
    ];
  }

  if (role === "tenant") {
    return [
      "dashboard:view",
      "properties:view",
      "payments:view",
      "notifications:view",
    ];
  }

  return [];
};
