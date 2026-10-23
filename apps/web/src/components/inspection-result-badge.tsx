import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { INSPECTION_RESULT_META } from "@/lib/inspections/results";
import type { InspectionResult } from "@/lib/database.types";

// `as const` (not `Record<…, string>`): next-intl types message keys, so the
// lookup has to stay a literal union for `t(\`result.${…}\`)` to type-check.
const RESULT_KEY = {
  pass: "pass",
  attention: "attention",
  fail: "fail",
  not_checked: "notChecked",
} as const satisfies Record<InspectionResult, string>;

export type ResultLabelKey = (typeof RESULT_KEY)[InspectionResult];

/**
 * The one way an inspection result is rendered, on every surface.
 *
 * ACCESSIBILITY (spec section 15): the icon, the text label and the colour all
 * carry the status, so it survives colour blindness, greyscale printing and a
 * screen reader. There is deliberately no icon-only variant -- if the label
 * ever became optional, one caller would drop it and the report would fail the
 * "never by colour alone" rule.
 */
export function InspectionResultBadge({
  result,
  className,
}: {
  result: InspectionResult;
  className?: string;
}) {
  const t = useTranslations("inspections");
  const meta = INSPECTION_RESULT_META[result];
  const Icon = meta.Icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.badgeClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {t(`result.${RESULT_KEY[result]}`)}
    </span>
  );
}

/** Translation key suffix for a result, for callers building their own labels. */
export function resultLabelKey(result: InspectionResult): ResultLabelKey {
  return RESULT_KEY[result];
}
