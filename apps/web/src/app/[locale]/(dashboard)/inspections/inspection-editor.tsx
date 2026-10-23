"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { FileUpload } from "@/components/file-upload";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTION_RESULT_META, RESULT_ORDER } from "@/lib/inspections/results";
import { INSPECTION_ITEM_ENTITY } from "@/lib/validation/evidence";
import { cn } from "@/lib/utils";
import { resultLabelKey } from "@/components/inspection-result-badge";
import type { InspectionResult } from "@/lib/database.types";
import type { InspectionItemView } from "@/lib/inspections/data";

import {
  recordInspectionItemPhoto,
  removeInspectionItemPhoto,
  updateInspectionItem,
  type FormState,
} from "./actions";

const initial: FormState = {};

/** Surface an action's outcome once per distinct message. */
function useActionToast(state: FormState) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state]);
}

/**
 * One checklist item, as a stacked card.
 *
 * The whole card is a single form so that changing the result also persists
 * whatever note is currently typed -- on a phone, the technician taps a result
 * and walks to the next wheel; there is no separate save step to forget.
 */
function ItemCard({
  item,
  inspectionId,
  businessId,
  bucket,
  editable,
}: {
  item: InspectionItemView;
  inspectionId: string;
  businessId: string;
  /** Passed down from the server page: lib/storage.ts is server-only. */
  bucket: string;
  editable: boolean;
}) {
  const t = useTranslations("dashboardInspections.editor");
  const tResult = useTranslations("inspections");
  const [state, action] = useActionState(updateInspectionItem, initial);
  const [removeState, removeAction] = useActionState(
    removeInspectionItemPhoto,
    initial,
  );
  const [result, setResult] = useState<InspectionResult>(item.result);
  const [note, setNote] = useState(item.note ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const groupName = useId();

  useActionToast(state);
  useActionToast(removeState);

  // Server data wins after a revalidation, so a save made on another device (or
  // a rejected write) is reflected instead of the stale local guess.
  useEffect(() => setResult(item.result), [item.result]);
  useEffect(() => setNote(item.note ?? ""), [item.note]);

  return (
    <li className="bg-card rounded-xl border p-4 shadow-xs">
      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="inspection_id" value={inspectionId} />
        <input type="hidden" name="item_id" value={item.id} />

        <p className="text-sm leading-6 font-medium">{item.label}</p>

        <fieldset disabled={!editable} className="min-w-0">
          <legend className="sr-only">
            {t("resultLegend", { label: item.label })}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RESULT_ORDER.map((option) => {
              const meta = INSPECTION_RESULT_META[option];
              const Icon = meta.Icon;
              const selected = result === option;
              return (
                <label
                  key={option}
                  className={cn(
                    // 44px minimum touch target, per spec section 15.
                    "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors",
                    "focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-1",
                    selected
                      ? meta.selectedClass
                      : "border-border text-muted-foreground hover:bg-muted",
                    !editable && "cursor-default opacity-70",
                  )}
                >
                  <input
                    type="radio"
                    name={`result-${groupName}`}
                    value={option}
                    checked={selected}
                    onChange={() => {
                      setResult(option);
                      // Persist immediately; the note field rides along.
                      formRef.current?.requestSubmit();
                    }}
                    // Native radio keeps arrow-key navigation and the
                    // screen-reader group semantics; sr-only, not hidden, so it
                    // stays focusable.
                    className="sr-only"
                  />
                  <Icon aria-hidden className="size-3.5 shrink-0" />
                  {tResult(`result.${resultLabelKey(option)}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* The submitted result must match the radio even though the radios are
            grouped under a generated name to keep ids unique across cards. */}
        <input type="hidden" name="result" value={result} />

        <div className="space-y-2">
          <Label htmlFor={`note-${item.id}`} className="text-xs">
            {t("noteLabel")}
          </Label>
          <Textarea
            id={`note-${item.id}`}
            name="note"
            rows={2}
            value={note}
            disabled={!editable}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
          />
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton variant="secondary" size="sm">
              {t("saveItem")}
            </SubmitButton>
          </div>
        )}
      </form>

      {(item.photos.length > 0 || editable) && (
        <div className="mt-3 space-y-2">
          {item.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {item.photos.map((photo) => (
                <li key={photo.id} className="relative">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={t("photoAlt", { label: item.label })}
                      className="aspect-square w-full rounded-lg border object-cover"
                    />
                  </a>
                  {editable && (
                    <form action={removeAction} className="absolute end-1 top-1">
                      <input
                        type="hidden"
                        name="inspection_id"
                        value={inspectionId}
                      />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="media_id" value={photo.id} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="icon-xs"
                        aria-label={t("removePhoto")}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <FileUpload
              bucket={bucket}
              businessId={businessId}
              entity={INSPECTION_ITEM_ENTITY}
              resourceId={item.id}
              accept="image/*"
              label={t("addPhoto")}
              onUpload={recordInspectionItemPhoto.bind(
                null,
                inspectionId,
                item.id,
              )}
            />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The checklist, grouped into its snapshot sections.
 *
 * Built as a stacked card list rather than a table: this is used one-handed on
 * a phone in a workshop bay, where a horizontally scrolling table is unusable.
 */
export function InspectionEditor({
  inspectionId,
  businessId,
  bucket,
  sections,
  editable,
  checked,
  total,
}: {
  inspectionId: string;
  businessId: string;
  bucket: string;
  sections: Array<{ section: string; items: InspectionItemView[] }>;
  editable: boolean;
  checked: number;
  total: number;
}) {
  const t = useTranslations("dashboardInspections.editor");
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{t("progress", { checked, total })}</span>
          <span className="text-muted-foreground tabular-nums">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={checked}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={t("progress", { checked, total })}
          className="bg-muted h-2 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!editable && (
          <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
        )}
      </div>

      {sections.map(({ section, items }) => (
        <section key={section} className="space-y-3">
          <h2 className="flex flex-wrap items-baseline gap-2 text-sm font-semibold">
            {section}
            <span className="text-muted-foreground text-xs font-normal">
              {t("sectionCount", { count: items.length })}
            </span>
          </h2>
          <ul className="space-y-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                inspectionId={inspectionId}
                businessId={businessId}
                bucket={bucket}
                editable={editable}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
