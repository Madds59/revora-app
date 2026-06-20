"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  getFeedbackCategoryLabel,
  getFeedbackSeverityLabel,
} from "@/lib/launch-ops";

export type FeedbackAccountOption = {
  businessId: string;
  customerId: string | null;
  label: string;
};

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const initial: FormState = {};

export function FeedbackSubmissionForm({
  action,
  accounts,
  businessId,
  source,
  submitLabel,
  accountLabel,
  titlePlaceholder,
}: {
  action: Action;
  accounts?: FeedbackAccountOption[];
  businessId?: string;
  source: "dashboard" | "portal";
  submitLabel: string;
  accountLabel?: string;
  titlePlaceholder: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const t = useTranslations("feedback.form");
  const locale = useLocale();
  const [selectedAccount, setSelectedAccount] = useState(accounts?.[0] ?? null);
  const [pageUrl, setPageUrl] = useState("");
  const [browserInfo, setBrowserInfo] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const lastMessage = useRef<string | undefined>(undefined);

  const categoryOptions = useMemo(() => FEEDBACK_CATEGORIES, []);
  const severityOptions = useMemo(() => FEEDBACK_SEVERITIES, []);
  const accountValue = (account: FeedbackAccountOption) =>
    `${account.businessId}:${account.customerId ?? "none"}`;

  useEffect(() => {
    setPageUrl(window.location.href);
    setBrowserInfo(window.navigator.userAgent);
  }, []);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      formRef.current?.reset();
      if (accounts?.length) {
        setSelectedAccount(accounts[0]);
      }
      setPageUrl(window.location.href);
      setBrowserInfo(window.navigator.userAgent);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [accounts, state.error, state.message]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="page_url" value={pageUrl} />
      <input type="hidden" name="browser_info" value={browserInfo} />

      {accounts?.length ? (
        <div className="grid gap-2">
          <Label htmlFor="feedback_account">{accountLabel ?? t("account")}</Label>
          <Select
            value={selectedAccount ? accountValue(selectedAccount) : ""}
            onValueChange={(value) => {
              const next =
                accounts.find((account) => accountValue(account) === value) ?? null;
              setSelectedAccount(next);
            }}
          >
            <SelectTrigger id="feedback_account" className="w-full">
              <SelectValue placeholder={accountLabel ?? t("account")} />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem
                  key={accountValue(account)}
                  value={accountValue(account)}
                >
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="business_id" value={selectedAccount?.businessId ?? ""} />
          <input type="hidden" name="customer_id" value={selectedAccount?.customerId ?? ""} />
        </div>
      ) : (
        <input type="hidden" name="business_id" value={businessId ?? ""} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="category">{t("category")}</Label>
          <Select name="category" defaultValue="feedback">
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder={t("category")} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {getFeedbackCategoryLabel(category, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="severity">{t("severity")}</Label>
          <Select name="severity" defaultValue="normal">
            <SelectTrigger id="severity" className="w-full">
              <SelectValue placeholder={t("severity")} />
            </SelectTrigger>
            <SelectContent>
              {severityOptions.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {getFeedbackSeverityLabel(severity, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="title">{t("title")}</Label>
        <Input id="title" name="title" required placeholder={titlePlaceholder} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea id="description" name="description" rows={6} required />
      </div>

      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
