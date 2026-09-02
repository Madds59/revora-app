"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import {
  startEnrollment,
  unenrollFactor,
  verifyEnrollment,
  type MfaActionState,
  type StartEnrollmentState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MfaFactorView = {
  id: string;
  createdAtLabel: string;
};

const initialMfaState: MfaActionState = {};
const initialStartState: StartEnrollmentState = {};

/** Digits-only OTP field. Never `type="number"` — spinners and locale digit
 * grouping break entry of a code that must be typed verbatim. */
function CodeField({ id, label }: { id: string; label: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name="code"
        required
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
      />
    </div>
  );
}

function FormMessage({ state }: { state: MfaActionState }) {
  if (state.error) return <p className="text-destructive text-sm">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

function EnrollmentFlow() {
  const t = useTranslations("settings.security");
  const [startState, startAction] = useActionState(startEnrollment, initialStartState);
  const [verifyState, verifyAction] = useActionState(verifyEnrollment, initialMfaState);
  const [enrolling, setEnrolling] = useState(false);
  const lastVerifyMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (startState.factorId) setEnrolling(true);
  }, [startState.factorId]);

  useEffect(() => {
    if (verifyState.message && verifyState.message !== lastVerifyMessage.current) {
      lastVerifyMessage.current = verifyState.message;
      // The server action already ran `revalidatePath("/settings/security")`,
      // so the parent Server Component re-fetches the now-verified factor —
      // this just collapses the local "in progress" UI back to idle.
      setEnrolling(false);
    }
  }, [verifyState.message]);

  if (!enrolling) {
    return (
      <form action={startAction}>
        <SubmitButton>{t("enroll.start")}</SubmitButton>
        <FormMessage state={startState} />
      </form>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("enroll.cardTitle")}</CardTitle>
        <CardDescription>{t("enroll.cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {startState.qrCode && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={startState.qrCode}
            alt={t("enroll.qrAlt")}
            className="h-40 w-40 rounded-lg border bg-white p-2"
          />
        )}
        {startState.secret && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("enroll.secretLabel")}</p>
            <p className="text-muted-foreground text-sm">{t("enroll.secretHint")}</p>
            <code
              dir="ltr"
              className="block break-all rounded-lg border bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              {startState.secret}
            </code>
          </div>
        )}

        <form action={verifyAction} className="flex flex-col gap-4">
          <input type="hidden" name="factor_id" value={startState.factorId ?? ""} />
          <CodeField id="enroll-code" label={t("enroll.codeLabel")} />
          <FormMessage state={verifyState} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton>{t("enroll.verify")}</SubmitButton>
            <button
              type="button"
              onClick={() => setEnrolling(false)}
              className="text-muted-foreground text-sm underline"
            >
              {t("enroll.cancel")}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RemoveFactorDialog({ factorId }: { factorId: string }) {
  const t = useTranslations("settings.security");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(unenrollFactor, initialMfaState);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      setOpen(false);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [state.error, state.message]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className="text-destructive text-sm underline">
            {t("factor.remove")}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("unenroll.title")}</DialogTitle>
          <DialogDescription>{t("unenroll.description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="factor_id" value={factorId} />
          <CodeField id={`unenroll-code-${factorId}`} label={t("unenroll.codeLabel")} />
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          <DialogFooter>
            <DialogClose
              render={
                <button type="button" className="text-muted-foreground text-sm">
                  {t("enroll.cancel")}
                </button>
              }
            />
            <SubmitButton variant="destructive">{t("unenroll.confirm")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SecurityClient({ factors }: { factors: MfaFactorView[] }) {
  const t = useTranslations("settings.security");
  const enabled = factors.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="text-emerald-600 size-5" />
          ) : (
            <ShieldOff className="text-muted-foreground size-5" />
          )}
          <CardTitle>
            {enabled ? t("status.enabledTitle") : t("status.disabledTitle")}
          </CardTitle>
        </div>
        <CardDescription>
          {enabled ? t("status.enabledDescription") : t("status.disabledDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {enabled ? (
          <ul className="flex flex-col gap-3">
            {factors.map((factor) => (
              <li
                key={factor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <span className="text-sm">
                  {t("factor.addedOn", { date: factor.createdAtLabel })}
                </span>
                <RemoveFactorDialog factorId={factor.id} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            icon={<ShieldOff className="size-5" />}
          />
        )}
      </CardContent>
      {!enabled && (
        <CardFooter>
          <EnrollmentFlow />
        </CardFooter>
      )}
    </Card>
  );
}
