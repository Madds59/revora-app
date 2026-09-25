/**
 * Both sidebars as data. No React here, so `node --test` can import it and the
 * grouping, filtering and active-path rules are unit-testable.
 *
 * The six modules hidden in phase 1 stay in the `tools` group carrying their
 * feature keys. visibleGroups drops a group left empty, so phase 1 renders
 * four groups; phase 2 re-enablement is a flag flip, not a re-placement.
 */

import { isFeatureEnabled } from "../features/flags.js";

/** @typedef {import("./types").NavItem} NavItem */
/** @typedef {import("./types").NavGroup} NavGroup */
/** @typedef {import("./types").NavPermissions} NavPermissions */
/** @typedef {import("../features/types").FeatureFlags} FeatureFlags */

/** @type {NavGroup[]} */
export const DASHBOARD_NAV = [
  {
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: "Home", aliases: ["/"] },
      { labelKey: "inspections", href: "/inspections", icon: "ClipboardCheck" },
    ],
  },
  {
    labelKey: "work",
    items: [
      { labelKey: "appointments", href: "/appointments", icon: "CalendarClock" },
      { labelKey: "jobs", href: "/jobs", icon: "Wrench" },
      { labelKey: "quotes", href: "/quotes", icon: "FileText", aliases: ["/quotations"] },
      { labelKey: "invoices", href: "/invoices", icon: "Receipt" },
    ],
  },
  {
    labelKey: "records",
    items: [
      { labelKey: "customers", href: "/customers", icon: "Users" },
      { labelKey: "vehicles", href: "/vehicles", icon: "CarFront" },
      { labelKey: "complaints", href: "/complaints", icon: "MessageSquareWarning" },
      { labelKey: "documents", href: "/documents", icon: "Files" },
    ],
  },
  {
    labelKey: "business",
    items: [
      { labelKey: "notifications", href: "/notifications", icon: "Bell" },
      { labelKey: "implementation", href: "/implementation", icon: "ClipboardList" },
      { labelKey: "billing", href: "/billing", icon: "CreditCard" },
      {
        labelKey: "settings",
        href: "/settings",
        icon: "Settings",
        aliases: ["/settings/business"],
      },
    ],
  },
  {
    labelKey: "tools",
    items: [
      {
        labelKey: "vehicleIntelligence",
        href: "/ai",
        icon: "ScanSearch",
        feature: "vehicleIntelligence",
        aliases: [
          "/ai/search",
          "/ai/vin-decoder",
          "/ai/dtc-decoder",
          "/ai/vehicle-diagnosis",
        ],
      },
      { labelKey: "analytics", href: "/analytics", icon: "BarChart3", feature: "analytics" },
      { labelKey: "maintenance", href: "/maintenance", icon: "Gauge", feature: "maintenance" },
      { labelKey: "feedback", href: "/feedback", icon: "MessageSquare", feature: "feedback" },
      {
        labelKey: "retainerCalculator",
        href: "/tools/retainer-calculator",
        icon: "Calculator",
        feature: "retainerCalculator",
        permission: "pricingTools",
      },
      {
        labelKey: "membershipBundles",
        href: "/tools/membership-bundles",
        icon: "Layers",
        feature: "membershipBundles",
        permission: "pricingTools",
      },
    ],
  },
];

/** @type {NavGroup[]} */
export const PORTAL_NAV = [
  {
    items: [
      { labelKey: "home", href: "/portal", icon: "Home", exact: true },
      { labelKey: "inspections", href: "/portal/inspections", icon: "ClipboardCheck" },
    ],
  },
  {
    labelKey: "myVehicles",
    items: [
      { labelKey: "vehicles", href: "/portal/vehicles", icon: "CarFront" },
      { labelKey: "documents", href: "/portal/documents", icon: "Files" },
    ],
  },
  {
    labelKey: "service",
    items: [
      { labelKey: "appointments", href: "/portal/appointments", icon: "CalendarClock" },
      { labelKey: "quotes", href: "/portal/quotes", icon: "FileText" },
      { labelKey: "invoices", href: "/portal/invoices", icon: "Receipt" },
      { labelKey: "jobs", href: "/portal/jobs", icon: "Wrench" },
    ],
  },
  {
    labelKey: "support",
    items: [
      { labelKey: "complaints", href: "/portal/complaints", icon: "MessageSquare" },
      { labelKey: "settings", href: "/portal/settings", icon: "Settings" },
    ],
  },
  {
    labelKey: "tools",
    items: [
      {
        labelKey: "memberships",
        href: "/portal/memberships",
        icon: "Layers",
        feature: "membershipBundles",
      },
      {
        labelKey: "feedbackSupport",
        href: "/portal/feedback",
        icon: "MessageSquare",
        feature: "feedback",
      },
    ],
  },
];

/**
 * Drop items whose feature is off OR whose permission is denied — the two
 * predicates are independent and both must pass — then drop empty groups.
 *
 * @param {NavGroup[]} groups
 * @param {{ features: FeatureFlags, permissions: NavPermissions }} opts
 * @returns {NavGroup[]} new array; the source model is never mutated
 */
export function visibleGroups(groups, { features, permissions }) {
  /** @type {NavGroup[]} */
  const visible = [];
  for (const group of groups) {
    const items = group.items.filter(
      (item) =>
        isFeatureEnabled(features, item.feature) &&
        (item.permission === undefined || permissions[item.permission] === true),
    );
    if (items.length > 0) visible.push({ ...group, items });
  }
  return visible;
}

/**
 * @param {string} pathname locale-stripped pathname from `usePathname()`
 * @param {NavItem} item
 * @returns {boolean}
 */
export function isNavItemActive(pathname, item) {
  const candidates = [item.href, ...(item.aliases ?? [])];
  return candidates.some((candidate) => {
    if (item.exact) return pathname === candidate;
    if (candidate === "/") return pathname === "/";
    if (pathname === candidate) return true;
    return pathname.startsWith(`${candidate}/`);
  });
}
