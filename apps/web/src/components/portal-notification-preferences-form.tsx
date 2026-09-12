"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { savePortalNotificationPreferences, type FormState } from "@/app/[locale]/(portal)/portal/actions";
import { FormError } from "@/components/form-error";
import { SubmitButton } from "@/components/submit-button";

const initial: FormState = {};

export type PortalPreferenceAccount = {
  customerId: string;
  businessId: string;
  businessName: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
};

/**
 * One form per linked workshop account: two channel checkboxes and a save
 * button. Each checkbox is wrapped in its own <label> so the whole row is the
 * click target and screen readers announce the channel name.
 */
export function PortalNotificationPreferencesForm({
  account,
}: {
  account: PortalPreferenceAccount;
}) {
  const t = useTranslations("portalSettings.preferences");
  const [state, action] = useActionState(savePortalNotificationPreferences, initial);
  const last = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
    }
  }, [state.message]);

  const emailId = `pref-email-${account.customerId}`;
  const smsId = `pref-sms-${account.customerId}`;

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="business_id" value={account.businessId} />
      <input type="hidden" name="customer_id" value={account.customerId} />
      <p className="text-sm font-medium">{account.businessName}</p>
      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="flex items-center gap-2 text-sm">
          <input
            id={emailId}
            type="checkbox"
            name="email_enabled"
            defaultChecked={account.emailEnabled}
            className="accent-primary size-4"
          />
          {t("email")}
        </label>
        <label htmlFor={smsId} className="flex items-center gap-2 text-sm">
          <input
            id={smsId}
            type="checkbox"
            name="sms_enabled"
            defaultChecked={account.smsEnabled}
            className="accent-primary size-4"
          />
          {t("sms")}
        </label>
      </div>
      <FormError message={state.error} />
      <div>
        <SubmitButton size="sm" variant="secondary">
          {t("save")}
        </SubmitButton>
      </div>
    </form>
  );
}
