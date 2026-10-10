/** Settings sections and who can open them. Pages enforce the same roles server-side. */
export const SETTINGS_SECTIONS = [
  { href: "/dashboard/settings", label: "Organization", roles: ["owner", "admin", "billing"] },
  { href: "/dashboard/settings/devices", label: "Devices", roles: ["owner", "admin", "ops_manager", "supervisor"] },
  { href: "/dashboard/settings/audit-log", label: "Change history", roles: ["owner", "admin"] },
];
