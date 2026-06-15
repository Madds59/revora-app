"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/money";
import { formatNumber } from "@/lib/formatters";
import { selectBundle, type FormState } from "@/lib/actions/membership-bundles";

export type PortalBundle = {
  id: string;
  businessName: string;
  name: string;
  tier: "essential" | "growth" | "premium" | "custom";
  description: string;
  currency: string;
  billingCycle: string;
  price: number;
  includedVisits: number;
  slaLevel: "standard" | "priority" | "vip";
};

const initial: FormState<{ bundleId: string }> = {};

function cycleSuffixKey(cycle: string): "portal.perMonth" | "portal.perQuarter" | "portal.perYear" {
  if (cycle === "annual") return "portal.perYear";
  if (cycle === "quarterly") return "portal.perQuarter";
  return "portal.perMonth";
}

function PlanCard({ bundle }: { bundle: PortalBundle }) {
  const t = useTranslations("bundles");
  const [state, action] = useActionState(selectBundle, initial);
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
    }
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium leading-5">{bundle.name}</div>
            {bundle.businessName && (
              <div className="text-muted-foreground text-xs">{bundle.businessName}</div>
            )}
          </div>
          <Badge variant="outline">{t(`tiers.${bundle.tier}`)}</Badge>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-primary text-2xl font-semibold tabular-nums">
            {formatCurrency(bundle.price, bundle.currency)}
          </span>
          <span className="text-muted-foreground text-sm">{t(cycleSuffixKey(bundle.billingCycle))}</span>
        </div>

        {bundle.description && (
          <p className="text-muted-foreground text-sm leading-6">{bundle.description}</p>
        )}

        <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
          <li>{t("portal.includedVisits", { count: formatNumber(bundle.includedVisits) })}</li>
          <li>{t("portal.sla", { level: t(`slaLabels.${bundle.slaLevel}`) })}</li>
        </ul>

        <form action={action} className="mt-auto pt-2">
          <input type="hidden" name="bundleId" value={bundle.id} />
          <SubmitButton className="w-full">{t("portal.select")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function MembershipPlans({ bundles }: { bundles: PortalBundle[] }) {
  const t = useTranslations("bundles");
  if (bundles.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {t("portal.empty")}
      </p>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bundles.map((bundle) => (
        <PlanCard key={bundle.id} bundle={bundle} />
      ))}
    </div>
  );
}
