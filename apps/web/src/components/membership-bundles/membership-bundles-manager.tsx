"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import {
  createMembershipBundle,
  createQuoteFromBundle,
  deleteMembershipBundle,
  generateBundlesFromScenario,
  setMembershipBundlePublished,
  type FormState,
} from "@/lib/actions/membership-bundles";
import type { MembershipBundleRecord } from "@/lib/bundles/types";

type Option = { id: string; label: string };

const initial = {};
const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function useToast(state: FormState, onSuccess?: () => void) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
      onSuccess?.();
    }
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state, onSuccess]);
}

function GenerateForm({ scenarios }: { scenarios: Option[] }) {
  const t = useTranslations("bundles");
  const [state, action] = useActionState(generateBundlesFromScenario, initial);
  useToast(state);

  if (scenarios.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("generate.noScenarios")}</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="scenarioId">{t("generate.selectScenario")}</Label>
        <select id="scenarioId" name="scenarioId" className={selectClass} defaultValue={scenarios[0]?.id}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton variant="secondary">{t("actions.generate")}</SubmitButton>
    </form>
  );
}

function AddBundleForm() {
  const t = useTranslations("bundles");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createMembershipBundle, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => {
    formRef.current?.reset();
    setOpen(false);
  });

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("actions.add")}
      </Button>
    );
  }

  // Visible fields feed a hidden JSON payload the server action validates.
  return (
    <form
      ref={formRef}
      action={(formData) => {
        const draft = {
          name: String(formData.get("name") ?? ""),
          tier: String(formData.get("tier") ?? "custom"),
          description: String(formData.get("description") ?? ""),
          currency: String(formData.get("currency") ?? "AED"),
          billingCycle: String(formData.get("billingCycle") ?? "monthly"),
          price: Number(formData.get("price") ?? 0),
          includedVisits: Number(formData.get("includedVisits") ?? 0),
          includedLaborHours: Number(formData.get("includedLaborHours") ?? 0),
          slaLevel: String(formData.get("slaLevel") ?? "standard"),
          features: [],
          isPublished: formData.get("isPublished") === "on",
          sortOrder: 0,
        };
        formData.set("payload", JSON.stringify(draft));
        action(formData);
      }}
      className="grid gap-3 rounded-xl border bg-card/60 p-4 sm:grid-cols-2"
    >
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="name">{t("fields.name")}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tier">{t("fields.tier")}</Label>
        <select id="tier" name="tier" className={selectClass} defaultValue="custom">
          {(["essential", "growth", "premium", "custom"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`tiers.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="price">{t("fields.price")}</Label>
        <Input id="price" name="price" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="currency">{t("fields.currency")}</Label>
        <select id="currency" name="currency" className={selectClass} defaultValue="AED">
          {["AED", "USD", "SAR"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="billingCycle">{t("fields.billingCycle")}</Label>
        <select id="billingCycle" name="billingCycle" className={selectClass} defaultValue="monthly">
          {["monthly", "quarterly", "annual"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="includedVisits">{t("fields.includedVisits")}</Label>
        <Input id="includedVisits" name="includedVisits" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="includedLaborHours">{t("fields.includedLaborHours")}</Label>
        <Input id="includedLaborHours" name="includedLaborHours" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="slaLevel">{t("fields.sla")}</Label>
        <select id="slaLevel" name="slaLevel" className={selectClass} defaultValue="standard">
          {(["standard", "priority", "vip"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`slaLabels.${v}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="description">{t("fields.description")}</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" className="size-4" />
        {t("fields.published")}
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("actions.cancel")}
        </Button>
        <SubmitButton>{t("actions.save")}</SubmitButton>
      </div>
    </form>
  );
}

function PublishButton({ bundle }: { bundle: MembershipBundleRecord }) {
  const t = useTranslations("bundles");
  const [state, action] = useActionState(setMembershipBundlePublished, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={bundle.id} />
      <input type="hidden" name="publish" value={(!bundle.isPublished).toString()} />
      <SubmitButton variant="outline" size="sm">
        {bundle.isPublished ? t("actions.unpublish") : t("actions.publish")}
      </SubmitButton>
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const t = useTranslations("bundles");
  const [state, action] = useActionState(deleteMembershipBundle, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm">
        {t("actions.delete")}
      </SubmitButton>
    </form>
  );
}

function CreateQuoteForm({ bundleId, customers }: { bundleId: string; customers: Option[] }) {
  const t = useTranslations("bundles");
  const [state, action] = useActionState(createQuoteFromBundle, initial);
  useToast(state);
  if (customers.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="bundleId" value={bundleId} />
      <select name="customerId" className={selectClass} defaultValue={customers[0]?.id} aria-label={t("quote.selectCustomer")}>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <SubmitButton variant="secondary" size="sm">
        {t("actions.createQuote")}
      </SubmitButton>
    </form>
  );
}

export function MembershipBundlesManager({
  bundles,
  customers,
  scenarios,
}: {
  bundles: MembershipBundleRecord[];
  customers: { id: string; name: string }[];
  scenarios: { id: string; title: string }[];
}) {
  const t = useTranslations("bundles");
  const customerOptions: Option[] = customers.map((c) => ({ id: c.id, label: c.name }));
  const scenarioOptions: Option[] = scenarios.map((s) => ({ id: s.id, label: s.title }));

  return (
    <>
      <PageHeader title={t("manageTitle")} description={t("manageSubtitle")} action={<AddBundleForm />} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="text-sm font-medium">{t("generate.heading")}</div>
            <p className="text-muted-foreground text-sm">{t("generate.description")}</p>
            <GenerateForm scenarios={scenarioOptions} />
          </CardContent>
        </Card>

        {bundles.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            {t("empty")}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {bundles.map((bundle) => (
              <Card key={bundle.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium leading-5">{bundle.name}</div>
                      <div className="text-muted-foreground text-xs">{t(`tiers.${bundle.tier}`)}</div>
                    </div>
                    <Badge variant={bundle.isPublished ? "default" : "secondary"}>
                      {bundle.isPublished ? t("fields.published") : t("fields.draft")}
                    </Badge>
                  </div>
                  <div className="text-primary text-xl font-semibold tabular-nums">
                    {formatCurrency(bundle.price, bundle.currency)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t(`slaLabels.${bundle.slaLevel}`)} · {bundle.billingCycle}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <PublishButton bundle={bundle} />
                    <DeleteButton id={bundle.id} />
                  </div>
                  <CreateQuoteForm bundleId={bundle.id} customers={customerOptions} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
