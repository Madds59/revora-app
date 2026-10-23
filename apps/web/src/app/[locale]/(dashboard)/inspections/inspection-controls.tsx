"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InspectionResultBadge } from "@/components/inspection-result-badge";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SHARE_EXPIRY_DEFAULT_DAYS } from "@/lib/validation/inspections";
import type { InspectionItemView } from "@/lib/inspections/data";

import {
  completeInspection,
  createQuotationFromInspection,
  generateInspectionShare,
  revokeInspectionShare,
  type FormState,
} from "./actions";

const initial: FormState = {};

function useActionToast(state: FormState, onSuccess?: () => void) {
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

/** Draft -> completed. Warns honestly about items left as `not_checked`. */
export function CompleteInspectionForm({
  inspectionId,
  uncheckedCount,
}: {
  inspectionId: string;
  uncheckedCount: number;
}) {
  const t = useTranslations("dashboardInspections.complete");
  const [state, action] = useActionState(completeInspection, initial);
  useActionToast(state);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <p className="text-muted-foreground text-sm leading-6">
        {t("description")}
      </p>
      {uncheckedCount > 0 && (
        <p className="text-sm leading-6">
          {t("unchecked", { count: uncheckedCount })}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="inspection-summary">{t("summaryLabel")}</Label>
        <Textarea
          id="inspection-summary"
          name="summary"
          rows={3}
          placeholder={t("summaryPlaceholder")}
        />
      </div>
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}

/**
 * Findings -> draft quotation.
 *
 * Only `attention` and `fail` items are offered, matching what the RPC will
 * accept. No price appears anywhere in this form: the quotation is created with
 * zero-priced lines for staff to fill in, and inventing a number here would be
 * the single most damaging thing this feature could do.
 */
export function FindingsForm({
  inspectionId,
  findings,
  quotationId,
  canQuote,
}: {
  inspectionId: string;
  findings: InspectionItemView[];
  quotationId: string | null;
  canQuote: boolean;
}) {
  const t = useTranslations("dashboardInspections.findings");
  const [state, action] = useActionState(createQuotationFromInspection, initial);
  const [selected, setSelected] = useState<string[]>(() =>
    findings.map((f) => f.id),
  );
  useActionToast(state);

  const allSelected = useMemo(
    () => findings.length > 0 && selected.length === findings.length,
    [findings.length, selected.length],
  );

  if (findings.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("none")}</p>;
  }

  if (quotationId) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6">{t("alreadyQuoted")}</p>
        <a
          href={`/quotations/${quotationId}`}
          className="text-primary text-sm underline underline-offset-4"
        >
          {t("viewQuotation")}
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <p className="text-muted-foreground text-sm leading-6">
        {t("description")}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            setSelected(allSelected ? [] : findings.map((f) => f.id))
          }
        >
          {t("selectAll")}
        </Button>
      </div>

      <ul className="space-y-2">
        {findings.map((finding) => {
          const checked = selected.includes(finding.id);
          return (
            <li key={finding.id}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  name="item_ids"
                  value={finding.id}
                  checked={checked}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, finding.id]
                        : prev.filter((id) => id !== finding.id),
                    )
                  }
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{finding.label}</span>
                    <InspectionResultBadge result={finding.result} />
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {finding.section}
                  </span>
                  {finding.note && (
                    <span className="text-muted-foreground block text-sm leading-6">
                      {finding.note}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-xs leading-5">{t("priceNote")}</p>

      {canQuote ? (
        <SubmitButton disabled={selected.length === 0}>
          {t("submit")}
        </SubmitButton>
      ) : null}
    </form>
  );
}

const DURATION_OPTIONS = [7, 14, 30, 90];

/**
 * Share-link lifecycle: generate, rotate, revoke.
 *
 * The plaintext link exists only in `state.shareUrl`, for one render. It is
 * never re-fetched -- the server keeps a SHA-256 digest and nothing else -- so
 * losing this panel means rotating to a new link, which is exactly the property
 * that makes a database leak harmless.
 */
export function ShareControls({
  inspectionId,
  share,
}: {
  inspectionId: string;
  share: {
    active: boolean;
    createdAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  };
}) {
  const t = useTranslations("dashboardInspections.share");
  const [genState, genAction] = useActionState(
    generateInspectionShare,
    initial,
  );
  const [revokeState, revokeAction] = useActionState(
    revokeInspectionShare,
    initial,
  );
  const [days, setDays] = useState(String(SHARE_EXPIRY_DEFAULT_DAYS));
  useActionToast(genState);
  useActionToast(revokeState);

  // Joined to the browser's own origin, so no base URL is guessed server-side.
  const fullUrl =
    genState.shareUrl && typeof window !== "undefined"
      ? `${window.location.origin}${genState.shareUrl}`
      : null;

  async function copy() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success(t("copied"));
    } catch {
      // Clipboard can be blocked; the link stays selectable in the input.
      toast.error(t("copy"));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-6">
        {t("description")}
      </p>

      <p className="text-sm">
        {share.active && share.expiresAt ? (
          <span className="inline-flex items-center gap-2">
            <Link2 aria-hidden className="size-4" />
            {t("activeUntil", {
              date: new Date(share.expiresAt).toLocaleDateString(),
            })}
          </span>
        ) : share.revokedAt ? (
          t("revoked")
        ) : (
          t("noLink")
        )}
      </p>

      {fullUrl && (
        <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3">
          <p className="flex items-start gap-2 text-sm leading-6">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("showOnce")}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={fullUrl}
              aria-label={t("copy")}
              onFocus={(e) => e.currentTarget.select()}
              className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={copy}>
              <Copy className="size-3.5" />
              {t("copy")}
            </Button>
          </div>
        </div>
      )}

      <form action={genAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="inspection_id" value={inspectionId} />
        {/* The base-nova Select has no `name`, so the value is mirrored into a
            hidden input for FormData. */}
        <input type="hidden" name="expires_in_days" value={days} />
        <div className="grid gap-2">
          <Label htmlFor="share-duration">{t("durationLabel")}</Label>
          <Select value={days} onValueChange={(v) => setDays(v ?? days)}>
            <SelectTrigger id="share-duration" className="w-40">
              <SelectValue>
                {(value) =>
                  value ? t("days", { count: Number(value) }) : null
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {t("days", { count: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SubmitButton variant="secondary">
          {share.active ? t("rotate") : t("generate")}
        </SubmitButton>
      </form>

      {share.active && (
        <>
          <p className="text-muted-foreground text-xs leading-5">
            {t("rotateWarning")}
          </p>
          <form action={revokeAction}>
            <input type="hidden" name="inspection_id" value={inspectionId} />
            <SubmitButton variant="destructive" size="sm">
              {t("revoke")}
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
