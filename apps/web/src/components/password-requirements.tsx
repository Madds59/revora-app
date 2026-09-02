"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { passwordRules } from "@/lib/validation/password";

// The exact rule ids `passwordRules()` returns (see lib/validation/password.js).
// Kept as a literal union purely so the dynamic `rules.${id}` lookup below is
// type-checked against the `auth.password.rules` message keys — the ids
// themselves still come from the Task 1 module at runtime.
type PasswordRuleId =
  | "length"
  | "lowercase"
  | "uppercase"
  | "digit"
  | "symbol"
  | "notEmail"
  | "notCommon";

/**
 * Live "as you type" password-strength checklist (APPSEC-10 auth hardening,
 * Task 3).
 *
 * THIS IS A UX AFFORDANCE ONLY. It calls the same rule set as the server
 * (`passwordRules`, from the shared `lib/validation/password.js` module used
 * by both this client component and the Server Action's `passwordSchema`),
 * but nothing here is enforcement — a client component can always be
 * bypassed by calling the Server Action directly. `signUp` / `updatePassword`
 * in `actions.ts` re-run `passwordSchema()` on the server and remain the sole
 * authority on whether a password is accepted. Do not remove or weaken that
 * server-side check on the theory that this checklist already validates the
 * password.
 *
 * Uses `gap`/flex spacing only (no hardcoded `left`/`right`), so it is
 * RTL-safe without extra logical-property classes.
 */
export function PasswordRequirements({
  password,
  email,
  className,
}: {
  password: string;
  email?: string;
  className?: string;
}) {
  const t = useTranslations("auth.password");

  // An empty password isn't a real submission yet, and passwordRules()
  // reports `notEmail`/`notCommon` as trivially "met" for "" (there's no
  // email match and no denylist match in an empty string) — rendering that
  // would show two misleading green checks alongside five red Xs before the
  // user has typed anything. Show nothing until there's something to judge.
  if (password.length === 0) return null;

  const rules = passwordRules(password, { email });

  return (
    <div className={cn("text-xs", className)}>
      <p className="text-muted-foreground font-medium">
        {t("requirementsTitle")}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {rules.map((rule) => {
          const id = rule.id as PasswordRuleId;
          return (
            <li
              key={id}
              className={cn(
                "flex items-center gap-2",
                rule.met ? "text-success" : "text-muted-foreground",
              )}
            >
              {rule.met ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <X className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{t(`rules.${id}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
