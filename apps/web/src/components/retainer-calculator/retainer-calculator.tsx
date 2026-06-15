"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, FileOutput, Plus, RotateCcw, Save, Scale, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { calculateRetainer } from "@/lib/retainer/calculate-retainer.js";
import type {
  BillingCycle,
  Currency,
  LaborItem,
  PartsItem,
  PricingSettings,
  RetainerCalculationInput,
  RetainerCalculationResult,
  RetainerComparison,
  RetainerRecommendation,
  RetainerScenarioInput,
  RetainerScenarioRecord,
  RetainerWarning,
  SlaLevel,
  ToolItem,
} from "@/lib/retainer/types";
import {
  compareRetainerScenarios,
  convertScenarioToQuote,
  deleteRetainerScenario,
  duplicateRetainerScenario,
  saveRetainerScenario,
  type FormState,
} from "@/lib/actions/retainer-scenarios";
import { cn } from "@/lib/utils";

type CustomerOption = {
  id: string;
  fullName: string;
  detail: string;
};

type RetainerDraft = RetainerScenarioInput & {
  id?: string;
  status?: RetainerScenarioRecord["status"];
};

type RetainerCalculatorProps = {
  customers: CustomerOption[];
  scenarios: RetainerScenarioRecord[];
  printScenario?: RetainerScenarioRecord | null;
  isPrint?: boolean;
};

type Translate = ReturnType<typeof useTranslations>;

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankLaborItem(t?: Translate): LaborItem {
  return {
    id: makeId("labor"),
    role: t?.("defaults.laborRole") ?? "Technician",
    department: t?.("defaults.laborDepartment") ?? "Workshop",
    hourlyCost: 90,
    estimatedHours: 40,
    utilization: 0.85,
  };
}

function blankPartsItem(t?: Translate): PartsItem {
  return {
    id: makeId("parts"),
    name: t?.("defaults.partsName") ?? "Consumables",
    unitCost: 120,
    quantity: 6,
    markup: 0.25,
  };
}

function blankToolItem(t?: Translate): ToolItem {
  return {
    id: makeId("tool"),
    name: t?.("defaults.toolName") ?? "Scan tool",
    monthlyCost: 450,
    allocation: 0.35,
  };
}

function createDefaultInput(t?: Translate): RetainerCalculationInput {
  return {
    currency: "AED",
    billingCycle: "monthly",
    contractLengthMonths: 12,
    numberOfVehicles: 10,
    expectedMonthlyVisits: 24,
    slaLevel: "priority",
    laborItems: [
      blankLaborItem(t),
      {
        ...blankLaborItem(t),
        role: t?.("defaults.serviceAdvisorRole") ?? "Service advisor",
        department: t?.("defaults.frontOfficeDepartment") ?? "Front office",
        hourlyCost: 110,
        estimatedHours: 20,
        utilization: 0.75,
      },
    ],
    partsItems: [blankPartsItem(t)],
    toolItems: [blankToolItem(t)],
    overhead: {
      rent: 3000,
      utilities: 850,
      equipmentDepreciation: 1200,
      insurance: 650,
      adminOverhead: 2400,
      miscellaneous: 500,
    },
    risk: {
      reworkBuffer: 0.05,
      emergencySupportBuffer: 0.04,
      prioritySlaPremium: 0.05,
      warrantyReserve: 0.03,
      latePaymentRisk: 0.02,
    },
    pricing: {
      targetMargin: 0.35,
      minimumMargin: 0.25,
      discount: 0.03,
      vat: 0.05,
      rounding: "nearest_50",
      annualPrepayDiscount: 0.05,
    },
  };
}

function createDefaultDraft(t?: Translate): RetainerDraft {
  return {
    title: t?.("page.defaultTitle") ?? "New retainer scenario",
    description: t?.("page.defaultDescription") ?? "Monthly retainer pricing draft.",
    customerType: "corporate",
    serviceCategory: "fleet_maintenance",
    input: createDefaultInput(t),
    status: "draft",
  };
}

function retainerLabelMaps(t: Translate) {
  return {
    customerTypes: {
      individual: t("customerTypes.individual"),
      fleet: t("customerTypes.fleet"),
      corporate: t("customerTypes.corporate"),
      government: t("customerTypes.government"),
      insurance_partner: t("customerTypes.insurancePartner"),
    },
    serviceCategories: {
      general_workshop_maintenance: t("serviceCategories.generalWorkshopMaintenance"),
      detailing: t("serviceCategories.detailing"),
      tire_services: t("serviceCategories.tireServices"),
      inspection_package: t("serviceCategories.inspectionPackage"),
      fleet_maintenance: t("serviceCategories.fleetMaintenance"),
      custom: t("serviceCategories.custom"),
    },
    currencies: {
      AED: t("currencies.aed"),
      USD: t("currencies.usd"),
      SAR: t("currencies.sar"),
    },
    billingCycles: {
      monthly: t("billingCycles.monthly"),
      quarterly: t("billingCycles.quarterly"),
      annual: t("billingCycles.annual"),
    },
    slaLevels: {
      standard: t("slaLevels.standard"),
      priority: t("slaLevels.priority"),
      vip: t("slaLevels.vip"),
    },
    rounding: {
      none: t("rounding.none"),
      nearest_10: t("rounding.nearest10"),
      nearest_50: t("rounding.nearest50"),
      nearest_100: t("rounding.nearest100"),
      psychological: t("rounding.psychological"),
    },
    statuses: {
      draft: t("statuses.draft"),
      active: t("statuses.active"),
      archived: t("statuses.archived"),
      converted_to_quote: t("statuses.convertedToQuote"),
    },
    presets: {
      generalWorkshopMaintenance: t("presets.generalWorkshopMaintenance"),
      detailing: t("presets.detailing"),
      tireServices: t("presets.tireServices"),
      inspectionPackage: t("presets.inspectionPackage"),
      fleetMaintenance: t("presets.fleetMaintenance"),
      custom: t("presets.custom"),
    },
  };
}

function draftFromScenario(scenario: RetainerScenarioRecord): RetainerDraft {
  return {
    id: scenario.id,
    status: scenario.status,
    title: scenario.title,
    description: scenario.description,
    customerId: scenario.customerId ?? undefined,
    customerType: scenario.customerType,
    serviceCategory: scenario.serviceCategory,
    input: scenario.input,
  };
}

function formatPercent(value: number) {
  return `${formatNumber(value * 100, { maximumFractionDigits: 1 })}%`;
}

function warningToneClass(severity: RetainerWarning["severity"]) {
  if (severity === "critical") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (severity === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/40 text-foreground";
}

function recommendationToneClass(tone: RetainerRecommendation["tone"]) {
  if (tone === "positive") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/40 text-foreground";
}

function toScenarioPayload(draft: RetainerDraft): string {
  return JSON.stringify({
    id: draft.id,
    status: draft.status,
    title: draft.title,
    description: draft.description,
    customerId: draft.customerId,
    customerType: draft.customerType,
    serviceCategory: draft.serviceCategory,
    input: draft.input,
  });
}

function nextPreset(
  category: RetainerScenarioInput["serviceCategory"],
  t?: Translate,
): RetainerDraft {
  const draft = createDefaultDraft(t);
  draft.serviceCategory = category;
  switch (category) {
    case "detailing":
      draft.title = t?.("presets.detailing") ?? "Premium detailing retainer";
      draft.input.slaLevel = "standard";
      draft.input.numberOfVehicles = 6;
      draft.input.expectedMonthlyVisits = 12;
      draft.input.pricing.targetMargin = 0.3;
      draft.input.pricing.minimumMargin = 0.22;
      draft.input.laborItems = [
        {
          id: makeId("labor"),
          role: t?.("defaults.detailingLeadRole") ?? "Detailing lead",
          department: t?.("defaults.detailingDepartment") ?? "Detailing",
          hourlyCost: 75,
          estimatedHours: 32,
          utilization: 0.8,
        },
        {
          id: makeId("labor"),
          role: t?.("defaults.prepTechnicianRole") ?? "Prep technician",
          department: t?.("defaults.detailingDepartment") ?? "Detailing",
          hourlyCost: 55,
          estimatedHours: 24,
          utilization: 0.75,
        },
      ];
      break;
    case "tire_services":
      draft.title = t?.("presets.tireServices") ?? "Tire service retainer";
      draft.input.slaLevel = "priority";
      draft.input.numberOfVehicles = 18;
      draft.input.expectedMonthlyVisits = 30;
      draft.input.pricing.targetMargin = 0.34;
      draft.input.partsItems = [
        { id: makeId("parts"), name: t?.("defaults.valveStems") ?? "Valve stems", unitCost: 8, quantity: 40, markup: 0.2 },
        { id: makeId("parts"), name: t?.("defaults.balancingWeights") ?? "Balancing weights", unitCost: 15, quantity: 30, markup: 0.22 },
      ];
      break;
    case "inspection_package":
      draft.title = t?.("presets.inspectionPackage") ?? "Inspection package retainer";
      draft.input.slaLevel = "standard";
      draft.input.numberOfVehicles = 24;
      draft.input.expectedMonthlyVisits = 24;
      draft.input.pricing.targetMargin = 0.28;
      draft.input.toolItems = [blankToolItem(t), { id: makeId("tool"), name: t?.("defaults.inspectionTablet") ?? "Inspection tablet", monthlyCost: 180, allocation: 0.5 }];
      break;
    case "fleet_maintenance":
      draft.title = t?.("presets.fleetMaintenance") ?? "Fleet maintenance retainer";
      draft.input.slaLevel = "vip";
      draft.input.numberOfVehicles = 40;
      draft.input.expectedMonthlyVisits = 48;
      draft.input.pricing.targetMargin = 0.38;
      draft.input.pricing.minimumMargin = 0.3;
      draft.input.risk.prioritySlaPremium = 0.08;
      draft.input.risk.latePaymentRisk = 0.04;
      break;
    case "general_workshop_maintenance":
      draft.title = t?.("presets.generalWorkshopMaintenance") ?? "General workshop retainer";
      break;
    case "custom":
    default:
      draft.title = t?.("presets.custom") ?? "Custom retainer scenario";
      break;
  }
  return draft;
}

function updateArrayItem<T>(
  array: T[],
  index: number,
  updater: (value: T) => T,
): T[] {
  return array.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));
}

function DraftNumberInput({
  label,
  value,
  onChange,
  step = "0.01",
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input
        value={Number.isFinite(value) ? String(value) : "0"}
        inputMode="decimal"
        step={step}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ScenarioActionButton<T = unknown>({
  action,
  id,
  label,
  variant = "outline",
  icon,
  hiddenFields,
}: {
  action: (prev: FormState<T>, formData: FormData) => Promise<FormState<T>>;
  id: string;
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  icon?: React.ReactNode;
  hiddenFields?: Record<string, string>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, {} as FormState<T>);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      router.refresh();
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [router, state.error, state.message]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      {hiddenFields &&
        Object.entries(hiddenFields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <Button size="sm" variant={variant} type="submit">
        {icon}
        {label}
      </Button>
    </form>
  );
}

function ScenarioSummaryCard({
  scenario,
  selected,
  onCompareToggle,
  compareSelected,
  onLoad,
  onPrint,
  t,
}: {
  scenario: RetainerScenarioRecord;
  selected: boolean;
  compareSelected: boolean;
  onCompareToggle: (id: string) => void;
  onLoad: (scenario: RetainerScenarioRecord) => void;
  onPrint: (scenarioId: string) => void;
  t: Translate;
}) {
  const labels = retainerLabelMaps(t);
  const result = scenario.calculatedResults;
  return (
    <Card className={cn("border-border/70", selected && "ring-primary/40 ring-1")}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{scenario.title}</CardTitle>
            <CardDescription className="space-y-1">
              <div>{labels.serviceCategories[scenario.serviceCategory]}</div>
              <div>{labels.customerTypes[scenario.customerType]}</div>
            </CardDescription>
          </div>
          <Badge variant={scenario.status === "converted_to_quote" ? "default" : "outline"}>
            {labels.statuses[scenario.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("results.finalPrice")}</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(result.finalMonthlyRetainer, result.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("results.grossMargin")}</dt>
            <dd className="font-medium tabular-nums">{formatPercent(result.grossMargin)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("results.totalValue")}</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(result.totalContractValue, result.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("results.perVehicle")}</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(result.pricePerVehicle, result.currency)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={selected ? "secondary" : "outline"} onClick={() => onLoad(scenario)}>
            <Eye className="size-4" />
            {t("actions.loadScenario")}
          </Button>
          <Button type="button" size="sm" variant={compareSelected ? "default" : "outline"} onClick={() => onCompareToggle(scenario.id)}>
            <Scale className="size-4" />
            {compareSelected ? t("actions.removeRow") : t("actions.compare")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onPrint(scenario.id)}>
            <FileOutput className="size-4" />
            {t("actions.exportPdf")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScenarioActionButton action={duplicateRetainerScenario} id={scenario.id} label={t("actions.duplicateRow")} icon={<Copy className="size-4" />} />
          <ScenarioActionButton action={deleteRetainerScenario} id={scenario.id} label={t("actions.removeRow")} variant="destructive" icon={<Trash2 className="size-4" />} />
          <ScenarioActionButton action={convertScenarioToQuote} id={scenario.id} label={t("actions.createQuote")} variant="secondary" icon={<Sparkles className="size-4" />} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioTiers({
  tiers,
  currency,
  t,
}: {
  tiers: Array<{ title: string; result: RetainerCalculationResult; tone: "positive" | "neutral" | "warning" }>;
  currency: Currency;
  t: Translate;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {tiers.map((tier) => (
        <Card key={tier.title}>
          <CardHeader>
            <CardTitle>{tier.title}</CardTitle>
            <CardDescription>{t("tiers.heading")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(tier.result.finalMonthlyRetainer, currency)}
            </div>
            <div className={cn("rounded-lg border p-3 text-sm", recommendationToneClass(tier.tone))}>
              {formatPercent(tier.result.grossMargin)} margin · {formatCurrency(tier.result.totalContractValue, currency)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ResultsDashboard({
  result,
  t,
}: {
  result: RetainerCalculationResult;
  t: Translate;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[
        [t("results.internalCost"), formatCurrency(result.baseMonthlyCost, result.currency)],
        [t("results.recommended"), formatCurrency(result.finalMonthlyRetainer, result.currency)],
        [t("results.vat"), formatCurrency(result.vatAmount, result.currency)],
        [t("results.grossProfit"), formatCurrency(result.grossProfit, result.currency)],
        [t("results.breakEven"), formatCurrency(result.breakEvenPrice, result.currency)],
        [t("results.annualValue"), formatCurrency(result.annualContractValue, result.currency)],
      ].map(([label, value]) => (
        <Card key={label}>
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">{value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function PrintScenarioSummary({
  scenario,
  t,
}: {
  scenario: RetainerScenarioRecord;
  t: Translate;
}) {
  const labels = retainerLabelMaps(t);
  const result = scenario.calculatedResults;
  return (
    <div className="space-y-6 p-6 print:p-0">
      <Card className="print:shadow-none">
        <CardHeader>
          <CardTitle>{scenario.title}</CardTitle>
          <CardDescription>
            {labels.customerTypes[scenario.customerType]} · {labels.serviceCategories[scenario.serviceCategory]} · {labels.statuses[scenario.status]}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t("results.finalPrice")}</dt>
              <dd className="tabular-nums">{formatCurrency(result.finalMonthlyRetainer, result.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("results.grossMargin")}</dt>
              <dd className="tabular-nums">{formatPercent(result.grossMargin)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("results.totalValue")}</dt>
              <dd className="tabular-nums">{formatCurrency(result.totalContractValue, result.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t("results.perVehicle")}</dt>
              <dd className="tabular-nums">{formatCurrency(result.pricePerVehicle, result.currency)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("insights.heading")}</div>
            <div className="space-y-2">
              {result.warnings.map((warning) => (
                <div key={warning.code} className={cn("rounded-lg border p-3 text-sm", warningToneClass(warning.severity))}>
                  {warning.code}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioComparePanel({
  comparison,
  scenarios,
  t,
}: {
  comparison: RetainerComparison | null;
  scenarios: RetainerScenarioRecord[];
  t: Translate;
}) {
  if (!comparison || scenarios.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("scenarios.heading")}</CardTitle>
          <CardDescription>{t("scenarios.empty")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("scenarios.heading")}</CardTitle>
        <CardDescription>{comparison.recommendations.join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <Card key={scenario.id} size="sm">
              <CardHeader>
                <CardTitle className="text-sm">{scenario.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="tabular-nums">{formatCurrency(scenario.calculatedResults.finalMonthlyRetainer, scenario.calculatedResults.currency)}</div>
                <div className="tabular-nums">{formatPercent(scenario.calculatedResults.grossMargin)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Separator />
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-sm">{t("comparison.monthlySpread")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatCurrency(comparison.totalMonthlySpread, scenarios[0]?.calculatedResults.currency ?? "AED")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">{t("comparison.marginSpread")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatPercent(comparison.marginSpread)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function RetainerCalculator({
  customers,
  scenarios,
  printScenario,
  isPrint,
}: RetainerCalculatorProps) {
  const t = useTranslations("retainerCalculator");
  const labels = retainerLabelMaps(t);
  const router = useRouter();
  const [draft, setDraft] = useState<RetainerDraft>(() => {
    if (printScenario) return draftFromScenario(printScenario);
    return createDefaultDraft(t);
  });
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    printScenario?.id ?? scenarios[0]?.id ?? null,
  );
  const [compareIds, setCompareIds] = useState<string[]>(
    scenarios.slice(0, 2).map((scenario) => scenario.id),
  );

  const result = useMemo(() => calculateRetainer(draft.input), [draft.input]);
  const tierResults = useMemo(() => {
    const base = calculateRetainer(draft.input);
    const essential = calculateRetainer({
      ...draft.input,
      pricing: {
        ...draft.input.pricing,
        targetMargin: Math.max(draft.input.pricing.minimumMargin, draft.input.pricing.targetMargin - 0.05),
        discount: Math.min(0.08, draft.input.pricing.discount + 0.02),
      },
    });
    const premium = calculateRetainer({
      ...draft.input,
      slaLevel: "vip",
      pricing: {
        ...draft.input.pricing,
        targetMargin: Math.min(0.9, draft.input.pricing.targetMargin + 0.07),
        discount: Math.max(0, draft.input.pricing.discount - 0.01),
        rounding: "nearest_100",
      },
    });
    return [
      { title: t("tiers.essential"), result: essential, tone: "neutral" as const },
      { title: t("tiers.growth"), result: base, tone: "positive" as const },
      { title: t("tiers.premium"), result: premium, tone: "warning" as const },
    ];
  }, [draft.input, t]);

  const [saveState, saveAction] = useActionState(saveRetainerScenario, {});
  const [compareState, compareAction] = useActionState(compareRetainerScenarios, {});
  const compareResult = compareState.result ?? null;
  const compareScenarios = compareResult?.scenarios ?? [];
  const lastSaveMessage = useRef<string | undefined>(undefined);
  const lastCompareMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (saveState.message && saveState.message !== lastSaveMessage.current) {
      lastSaveMessage.current = saveState.message;
      toast.success(saveState.message);
      router.refresh();
      if (saveState.result) {
        setDraft(draftFromScenario(saveState.result));
        setSelectedScenarioId(saveState.result.id);
      }
    }
    if (saveState.error && saveState.error !== lastSaveMessage.current) {
      lastSaveMessage.current = saveState.error;
      toast.error(saveState.error);
    }
  }, [router, saveState.error, saveState.message, saveState.result]);

  useEffect(() => {
    if (compareState.message && compareState.message !== lastCompareMessage.current) {
      lastCompareMessage.current = compareState.message;
      toast.success(compareState.message);
      router.refresh();
    }
    if (compareState.error && compareState.error !== lastCompareMessage.current) {
      lastCompareMessage.current = compareState.error;
      toast.error(compareState.error);
    }
  }, [router, compareState.error, compareState.message]);

  function loadScenario(scenario: RetainerScenarioRecord) {
    setDraft(draftFromScenario(scenario));
    setSelectedScenarioId(scenario.id);
  }

  function applyPreset(category: RetainerScenarioInput["serviceCategory"]) {
    const preset = nextPreset(category, t);
    setDraft(preset);
    setSelectedScenarioId(null);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  function exportPdf() {
    if (typeof window === "undefined") return;
    if (selectedScenarioId) {
      const url = new URL(window.location.href);
      url.searchParams.set("print", "1");
      url.searchParams.set("scenario", selectedScenarioId);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
      return;
    }
    window.print();
  }

  const comparisonPayload = JSON.stringify({ ids: compareIds });
  const draftPayload = toScenarioPayload(draft);
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? printScenario ?? null;
  const presetOptions = [
    { value: "general_workshop_maintenance", label: labels.presets.generalWorkshopMaintenance },
    { value: "detailing", label: labels.presets.detailing },
    { value: "tire_services", label: labels.presets.tireServices },
    { value: "inspection_package", label: labels.presets.inspectionPackage },
    { value: "fleet_maintenance", label: labels.presets.fleetMaintenance },
    { value: "custom", label: labels.presets.custom },
  ] as const;
  const customerTypeOptions = [
    { value: "individual", label: labels.customerTypes.individual },
    { value: "fleet", label: labels.customerTypes.fleet },
    { value: "corporate", label: labels.customerTypes.corporate },
    { value: "government", label: labels.customerTypes.government },
    { value: "insurance_partner", label: labels.customerTypes.insurance_partner },
  ] as const;
  const currencyOptions = [
    { value: "AED", label: labels.currencies.AED },
    { value: "USD", label: labels.currencies.USD },
    { value: "SAR", label: labels.currencies.SAR },
  ] as const;
  const billingCycleOptions = [
    { value: "monthly", label: labels.billingCycles.monthly },
    { value: "quarterly", label: labels.billingCycles.quarterly },
    { value: "annual", label: labels.billingCycles.annual },
  ] as const;
  const slaOptions = [
    { value: "standard", label: labels.slaLevels.standard },
    { value: "priority", label: labels.slaLevels.priority },
    { value: "vip", label: labels.slaLevels.vip },
  ] as const;
  const roundingOptions = [
    { value: "none", label: labels.rounding.none },
    { value: "nearest_10", label: labels.rounding.nearest_10 },
    { value: "nearest_50", label: labels.rounding.nearest_50 },
    { value: "nearest_100", label: labels.rounding.nearest_100 },
    { value: "psychological", label: labels.rounding.psychological },
  ] as const;

  if (isPrint && printScenario) {
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("subtitle")}
        />
        <PrintScenarioSummary scenario={printScenario} t={t} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <>
            <Button type="button" variant="outline" onClick={exportPdf} className="print:hidden">
              <FileOutput className="size-4" />
              {t("actions.exportPdf")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(createDefaultDraft(t))} className="print:hidden">
              <RotateCcw className="size-4" />
              {t("actions.reset")}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>{t("context.heading")}</CardTitle>
              <CardDescription>{draft.id ? `${t("page.editing")} ${draft.title}` : t("page.createDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {presetOptions.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={draft.serviceCategory === preset.value ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => applyPreset(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Tabs defaultValue="context" className="print:hidden">
            <TabsList>
              <TabsTrigger value="context">{t("context.heading")}</TabsTrigger>
              <TabsTrigger value="labor">{t("labor.heading")}</TabsTrigger>
              <TabsTrigger value="parts">{t("parts.heading")}</TabsTrigger>
              <TabsTrigger value="tools">{t("tools.heading")}</TabsTrigger>
              <TabsTrigger value="overhead">{t("overhead.heading")}</TabsTrigger>
              <TabsTrigger value="risk">{t("risk.heading")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("pricing.heading")}</TabsTrigger>
            </TabsList>

            <TabsContent value="context" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("context.heading")}</CardTitle>
                  <CardDescription>{t("context.vehicles")}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2 md:col-span-2">
                    <Label>{t("context.title")}</Label>
                    <Input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label>{t("context.description")}</Label>
                    <Textarea value={draft.description ?? ""} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} rows={3} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("context.customerType")}</Label>
                    <Select value={draft.customerType} onValueChange={(value) => setDraft((prev) => ({ ...prev, customerType: value as RetainerScenarioInput["customerType"] }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {customerTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("context.serviceCategory")}</Label>
                    <Select value={draft.serviceCategory} onValueChange={(value) => setDraft((prev) => ({ ...prev, serviceCategory: value as RetainerScenarioInput["serviceCategory"] }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {presetOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("context.currency")}</Label>
                    <Select value={draft.input.currency} onValueChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, currency: value as Currency } }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{currencyOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("context.billingCycle")}</Label>
                    <Select value={draft.input.billingCycle} onValueChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, billingCycle: value as BillingCycle } }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{billingCycleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <DraftNumberInput label={t("context.contractLength")} value={draft.input.contractLengthMonths} min={1} step="1" onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, contractLengthMonths: Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)) } }))} />
                  <DraftNumberInput label={t("context.vehicles")} value={draft.input.numberOfVehicles} min={1} step="1" onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, numberOfVehicles: Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)) } }))} />
                  <DraftNumberInput label={t("context.visits")} value={draft.input.expectedMonthlyVisits} min={0} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, expectedMonthlyVisits: Math.max(0, Number.isFinite(value) ? value : 0) } }))} />
                  <div className="grid gap-2">
                    <Label>{t("context.sla")}</Label>
                    <Select value={draft.input.slaLevel} onValueChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, slaLevel: value as SlaLevel } }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{slaOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label>{t("context.attachCustomer")}</Label>
                    <Select
                      value={draft.customerId ?? "__none__"}
                      onValueChange={(value) => {
                        const nextCustomerId =
                          typeof value === "string" && value !== "__none__"
                            ? value
                            : undefined;
                        setDraft((prev) => ({ ...prev, customerId: nextCustomerId }));
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.fullName} · {customer.detail}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="labor" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("labor.heading")}</CardTitle>
                  <CardDescription>{t("actions.addRow")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.input.laborItems.map((item, index) => (
                    <div key={item.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-6">
                      <div className="grid gap-2 md:col-span-2">
                        <Label>{t("labor.role")}</Label>
                        <Input value={item.role} onChange={(event) => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: updateArrayItem(prev.input.laborItems, index, (current) => ({ ...current, role: event.target.value })) } }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("labor.department")}</Label>
                        <Input value={item.department ?? ""} onChange={(event) => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: updateArrayItem(prev.input.laborItems, index, (current) => ({ ...current, department: event.target.value })) } }))} />
                      </div>
                      <DraftNumberInput label={t("labor.hourlyCost")} value={item.hourlyCost} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: updateArrayItem(prev.input.laborItems, index, (current) => ({ ...current, hourlyCost: Number.isFinite(value) ? value : 0 })) } }))} />
                      <DraftNumberInput label={t("labor.hours")} value={item.estimatedHours} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: updateArrayItem(prev.input.laborItems, index, (current) => ({ ...current, estimatedHours: Number.isFinite(value) ? value : 0 })) } }))} />
                      <DraftNumberInput label={t("labor.utilization")} value={item.utilization} step="0.01" onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: updateArrayItem(prev.input.laborItems, index, (current) => ({ ...current, utilization: Number.isFinite(value) ? value : 0 })) } }))} />
                      <div className="flex items-end gap-2">
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: [...prev.input.laborItems, blankLaborItem()] } }))}>
                          <Plus className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, laborItems: prev.input.laborItems.length > 1 ? prev.input.laborItems.filter((_, itemIndex) => itemIndex !== index) : prev.input.laborItems } }))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parts" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("parts.heading")}</CardTitle>
                  <CardDescription>{t("actions.addRow")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.input.partsItems.map((item, index) => (
                    <div key={item.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-5">
                      <div className="grid gap-2 md:col-span-2">
                        <Label>{t("parts.item")}</Label>
                        <Input value={item.name} onChange={(event) => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: updateArrayItem(prev.input.partsItems, index, (current) => ({ ...current, name: event.target.value })) } }))} />
                      </div>
                      <DraftNumberInput label={t("parts.unitCost")} value={item.unitCost} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: updateArrayItem(prev.input.partsItems, index, (current) => ({ ...current, unitCost: Number.isFinite(value) ? value : 0 })) } }))} />
                      <DraftNumberInput label={t("parts.quantity")} value={item.quantity} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: updateArrayItem(prev.input.partsItems, index, (current) => ({ ...current, quantity: Number.isFinite(value) ? value : 0 })) } }))} />
                      <DraftNumberInput label={t("parts.markup")} value={item.markup} step="0.01" onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: updateArrayItem(prev.input.partsItems, index, (current) => ({ ...current, markup: Number.isFinite(value) ? value : 0 })) } }))} />
                      <div className="flex items-end gap-2">
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: [...prev.input.partsItems, blankPartsItem()] } }))}>
                          <Plus className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, partsItems: prev.input.partsItems.length > 1 ? prev.input.partsItems.filter((_, itemIndex) => itemIndex !== index) : prev.input.partsItems } }))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tools" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("tools.heading")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.input.toolItems.map((item, index) => (
                    <div key={item.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                      <div className="grid gap-2 md:col-span-2">
                        <Label>{t("tools.name")}</Label>
                        <Input value={item.name} onChange={(event) => setDraft((prev) => ({ ...prev, input: { ...prev.input, toolItems: updateArrayItem(prev.input.toolItems, index, (current) => ({ ...current, name: event.target.value })) } }))} />
                      </div>
                      <DraftNumberInput label={t("tools.monthlyCost")} value={item.monthlyCost} onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, toolItems: updateArrayItem(prev.input.toolItems, index, (current) => ({ ...current, monthlyCost: Number.isFinite(value) ? value : 0 })) } }))} />
                      <DraftNumberInput label={t("tools.allocation")} value={item.allocation} step="0.01" onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, toolItems: updateArrayItem(prev.input.toolItems, index, (current) => ({ ...current, allocation: Number.isFinite(value) ? value : 0 })) } }))} />
                      <div className="flex items-end gap-2">
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, toolItems: [...prev.input.toolItems, blankToolItem()] } }))}>
                          <Plus className="size-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setDraft((prev) => ({ ...prev, input: { ...prev.input, toolItems: prev.input.toolItems.length > 1 ? prev.input.toolItems.filter((_, itemIndex) => itemIndex !== index) : prev.input.toolItems } }))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overhead" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("overhead.heading")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["rent", t("overhead.rent")],
                    ["utilities", t("overhead.utilities")],
                    ["equipmentDepreciation", t("overhead.equipment")],
                    ["insurance", t("overhead.insurance")],
                    ["adminOverhead", t("overhead.admin")],
                    ["miscellaneous", t("overhead.misc")],
                  ] as const).map(([key, label]) => (
                    <DraftNumberInput
                      key={key}
                      label={label}
                      value={draft.input.overhead[key]}
                      onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, overhead: { ...prev.input.overhead, [key]: Number.isFinite(value) ? value : 0 } } }))}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="risk" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("risk.heading")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["reworkBuffer", t("risk.rework")],
                    ["emergencySupportBuffer", t("risk.emergency")],
                    ["prioritySlaPremium", t("risk.slaPremium")],
                    ["warrantyReserve", t("risk.warranty")],
                    ["latePaymentRisk", t("risk.latePayment")],
                  ] as const).map(([key, label]) => (
                    <DraftNumberInput
                      key={key}
                      label={label}
                      value={draft.input.risk[key]}
                      step="0.01"
                      onChange={(value) => setDraft((prev) => ({ ...prev, input: { ...prev.input, risk: { ...prev.input.risk, [key]: Number.isFinite(value) ? value : 0 } } }))}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("pricing.heading")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["targetMargin", t("pricing.targetMargin"), 0.01],
                    ["minimumMargin", t("pricing.minMargin"), 0.01],
                    ["discount", t("pricing.discount"), 0.01],
                    ["vat", t("pricing.vat"), 0.01],
                    ["annualPrepayDiscount", t("pricing.annualPrepayDiscount"), 0.01],
                  ] as const).map(([key, label, step]) => {
                    const value = key === "annualPrepayDiscount"
                      ? draft.input.pricing.annualPrepayDiscount ?? 0
                      : draft.input.pricing[key as keyof PricingSettings] as number;
                    return (
                      <DraftNumberInput
                        key={key}
                        label={label}
                        value={value}
                        step={String(step)}
                        onChange={(next) => setDraft((prev) => ({
                          ...prev,
                          input: {
                            ...prev.input,
                            pricing: {
                              ...prev.input.pricing,
                              [key]: Number.isFinite(next) ? next : 0,
                            },
                          },
                        }))}
                      />
                    );
                  })}
                  <div className="grid gap-2">
                    <Label>{t("pricing.rounding")}</Label>
                    <Select
                      value={draft.input.pricing.rounding}
                      onValueChange={(value) =>
                        setDraft((prev) => ({
                          ...prev,
                          input: {
                            ...prev.input,
                            pricing: {
                              ...prev.input.pricing,
                              rounding: value as PricingSettings["rounding"],
                            },
                          },
                        }))
                      }
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {roundingOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="print:hidden">
            <form action={saveAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="payload" value={draftPayload} />
              <Button type="submit" size="lg">
                <Save className="size-4" />
                {t("actions.save")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => {
                  if (draft.id) {
                    setDraft((prev) => ({ ...prev, status: "active" }));
                  }
                }}
                disabled={!draft.id}
              >
                <Sparkles className="size-4" />
                {t("actions.markRecommended")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => {
                  if (selectedScenarioId) {
                    const scenario = scenarios.find((item) => item.id === selectedScenarioId);
                    if (scenario) loadScenario(scenario);
                  }
                }}
                disabled={!selectedScenarioId}
              >
                <Eye className="size-4" />
                {t("actions.loadSelected")}
              </Button>
            </form>
          </div>

          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>{t("scenarios.heading")}</CardTitle>
              <CardDescription>{t("scenarios.status")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {scenarios.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("scenarios.empty")}</p>
              ) : (
                scenarios.map((scenario) => (
                  <ScenarioSummaryCard
                    key={scenario.id}
                    scenario={scenario}
                    selected={selectedScenarioId === scenario.id}
                    compareSelected={compareIds.includes(scenario.id)}
                    onCompareToggle={toggleCompare}
                    onLoad={loadScenario}
                    onPrint={(scenarioId) => {
                      if (typeof window === "undefined") return;
                      const url = new URL(window.location.href);
                      url.searchParams.set("print", "1");
                      url.searchParams.set("scenario", scenarioId);
                      window.open(url.toString(), "_blank", "noopener,noreferrer");
                    }}
                    t={t}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <div className="print:hidden">
            <form action={compareAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="payload" value={comparisonPayload} />
              <Button type="submit" variant="secondary">
                <Scale className="size-4" />
                {t("actions.compare")}
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-4 print:static">
            <CardHeader>
              <CardTitle>{t("results.heading")}</CardTitle>
              <CardDescription>
                {result.ok ? formatCurrency(result.finalMonthlyRetainer, result.currency) : result.error ?? "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResultsDashboard result={result} t={t} />

              <div className="space-y-2">
                <div className="text-sm font-medium">{t("insights.heading")}</div>
                <div className="space-y-2">
                  {result.warnings.map((warning) => (
                    <div key={warning.code} className={cn("rounded-lg border p-3 text-sm", warningToneClass(warning.severity))}>
                      {warning.code}
                    </div>
                  ))}
                  {result.recommendations.map((recommendation) => (
                    <div key={recommendation.code} className={cn("rounded-lg border p-3 text-sm", recommendationToneClass(recommendation.tone))}>
                      {recommendation.code}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <ScenarioTiers tiers={tierResults} currency={result.currency} t={t} />
            </CardContent>
          </Card>

          <ScenarioComparePanel
            comparison={compareResult}
            scenarios={compareScenarios}
            t={t}
          />

          {isPrint && selectedScenario ? (
            <PrintScenarioSummary scenario={selectedScenario} t={t} />
          ) : null}
        </div>
      </div>
    </>
  );
}
