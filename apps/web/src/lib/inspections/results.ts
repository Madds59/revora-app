import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { InspectionResult } from "@/lib/database.types";
import { INSPECTION_RESULTS, QUOTABLE_RESULTS } from "@/lib/validation/inspections";

/**
 * Presentation metadata for the four inspection results.
 *
 * Shared by the staff editor, the portal report and the public share page so a
 * result looks identical everywhere the customer might see it.
 *
 * ACCESSIBILITY (spec section 15): status is never conveyed by colour alone.
 * Every surface renders `Icon` AND the translated text label; the colour classes
 * are a third, redundant channel. Do not build a variant that drops the label.
 */
export type InspectionResultMeta = {
  Icon: LucideIcon;
  /** Chip styling: background + foreground, used with the Badge component. */
  badgeClass: string;
  /** Border/ring styling for the selected radio card. */
  selectedClass: string;
  /** Whether this result is eligible to become a quotation line. */
  quotable: boolean;
};

export const INSPECTION_RESULT_META: Record<
  InspectionResult,
  InspectionResultMeta
> = {
  pass: {
    Icon: CheckCircle2,
    badgeClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    selectedClass:
      "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    quotable: false,
  },
  attention: {
    Icon: AlertTriangle,
    badgeClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    selectedClass:
      "border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    quotable: true,
  },
  fail: {
    Icon: XCircle,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    selectedClass: "border-destructive bg-destructive/10 text-destructive",
    quotable: true,
  },
  // `not_checked` is a real outcome, not an absence of one, so it gets the same
  // treatment as the others -- a distinct icon and its own label. It is never
  // rendered as a pass and never silently omitted from a report.
  not_checked: {
    Icon: CircleDashed,
    badgeClass: "bg-muted text-muted-foreground border-border",
    selectedClass: "border-foreground/40 bg-muted text-foreground",
    quotable: false,
  },
};

/** The four results in the order they are offered to staff. */
export const RESULT_ORDER = INSPECTION_RESULTS as InspectionResult[];

/** Results that `create_quotation_from_inspection` will accept. */
export const QUOTABLE = QUOTABLE_RESULTS as InspectionResult[];

export function isQuotable(result: InspectionResult): boolean {
  return INSPECTION_RESULT_META[result]?.quotable === true;
}

/** Items whose result has been recorded -- i.e. anything but `not_checked`. */
export function countChecked(
  items: Array<{ result: InspectionResult }>,
): number {
  return items.filter((i) => i.result !== "not_checked").length;
}

/** Group items into their snapshot sections, preserving `position` order. */
export function groupBySection<T extends { section: string; position: number }>(
  items: T[],
): Array<{ section: string; items: T[] }> {
  const order: string[] = [];
  const bySection = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    if (!bySection.has(item.section)) {
      bySection.set(item.section, []);
      order.push(item.section);
    }
    bySection.get(item.section)!.push(item);
  }
  return order.map((section) => ({ section, items: bySection.get(section)! }));
}
