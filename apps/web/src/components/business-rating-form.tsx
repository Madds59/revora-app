"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RATING_VALUES } from "@/lib/ratings";

import { saveBusinessRating, type FormState } from "@/app/[locale]/(portal)/portal/actions";

const initial: FormState = {};

export function BusinessRatingForm({
  businessId,
  customerId,
}: {
  businessId: string;
  customerId: string;
}) {
  const t = useTranslations("ratings");
  const [state, formAction] = useActionState(saveBusinessRating, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      toast.success(state.message);
      formRef.current?.reset();
      return;
    }
    if (state.error) toast.error(state.error);
  }, [state.error, state.message]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("form.title")}</CardTitle>
        <CardDescription>{t("form.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="grid gap-4">
          <input type="hidden" name="business_id" value={businessId} />
          <input type="hidden" name="customer_id" value={customerId} />

          <div className="grid gap-2">
            <Label htmlFor="rating">{t("form.ratingLabel")}</Label>
            <select
              id="rating"
              name="rating"
              required
              defaultValue=""
              className="bg-background border-input h-10 rounded-md border px-3 text-sm shadow-sm outline-none"
            >
              <option value="" disabled>
                {t("form.ratingPlaceholder")}
              </option>
              {RATING_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="review">{t("form.reviewLabel")}</Label>
            <Textarea
              id="review"
              name="review"
              placeholder={t("form.reviewPlaceholder")}
              maxLength={1000}
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button type="submit" className="w-fit">
              {t("form.submit")}
            </Button>
            <p className="text-muted-foreground text-xs">{t("form.editableNote")}</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
