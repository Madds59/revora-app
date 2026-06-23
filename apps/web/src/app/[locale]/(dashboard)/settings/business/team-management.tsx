"use client";

import { useActionState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  inviteTeammate,
  revokeInvitation,
  type FormState,
} from "./invite-actions";
import { SubmitButton } from "@/components/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRoleLabel } from "@/lib/display-labels";
import type { MemberRole } from "@/lib/database.types";

const initial: FormState = {};

type PendingInvite = { id: string; email: string; role: MemberRole };
type TeamMember = { id: string; name: string; role: MemberRole };

function InviteForm() {
  const [state, action] = useActionState(inviteTeammate, initial);
  const locale = useLocale();
  const t = useTranslations("team");
  const formRef = useRef<HTMLFormElement>(null);
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state.message]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder={locale === "ar" ? "زميل@مثال.com" : "teammate@example.com"}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <Select name="role" defaultValue="employee">
            <SelectTrigger id="invite-role" className="w-40">
              <SelectValue>{(value) => (value ? getRoleLabel(value, locale) : null)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">{getRoleLabel("manager", locale)}</SelectItem>
              <SelectItem value="employee">{getRoleLabel("employee", locale)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">{t("sendInvitation")}</SubmitButton>
      </div>
    </form>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [state, action] = useActionState(revokeInvitation, initial);
  const t = useTranslations("team");
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
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm">
        {t("revoke")}
      </SubmitButton>
    </form>
  );
}

export function TeamManagement({
  members,
  pending,
  canManage,
}: {
  members: TeamMember[];
  pending: PendingInvite[];
  canManage: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("team");
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("member")}</TableHead>
              <TableHead>{t("role")}</TableHead>
            </TableRow>
          </TableHeader>
              <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{getRoleLabel(m.role, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pending.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">{t("pendingInvitations")}</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
                  <TableBody>
                {pending.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>{getRoleLabel(inv.role, locale)}</TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <RevokeButton id={inv.id} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {canManage ? (
        <InviteForm />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("ownersOnly")}
        </p>
      )}
    </div>
  );
}
