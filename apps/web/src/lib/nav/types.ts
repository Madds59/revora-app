import type { FeatureKey } from "@/lib/features/types";

export type NavPermissionKey = "pricingTools";

export type NavItem = {
  /** Key under `nav.*` in the message files. */
  labelKey: string;
  href: string;
  /** lucide-react export name; mapped to a component by the render layer. */
  icon: string;
  /** Extra paths that should mark this item active. */
  aliases?: string[];
  /** Match the pathname exactly instead of by prefix. */
  exact?: boolean;
  /** Absent means the item is never feature-gated. */
  feature?: FeatureKey;
  /** Absent means no role restriction. */
  permission?: NavPermissionKey;
};

export type NavGroup = {
  /** Key under `nav.group.*`. Absent renders the items with no header. */
  labelKey?: string;
  items: NavItem[];
};

export type NavPermissions = Record<NavPermissionKey, boolean>;
