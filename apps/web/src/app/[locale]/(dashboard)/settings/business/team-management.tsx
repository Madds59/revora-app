"use client";

import { useActionState, useEffect, useRef } from "react";
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
import { ROLE_LABELS } from "@/lib/permissions";
import type { MemberRole } from "@/lib/database.types";

const initial: FormState = {};

type PendingInvite = { id: string; email: string; role: MemberRole };
type TeamMember = { id: string; name: string; role: MemberRole };

function InviteForm() {
  const [state, action] = useActionState(inviteTeammate, initial);
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
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="teammate@example.com"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select name="role" defaultValue="employee">
            <SelectTrigger id="invite-role" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="employee">Service advisor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">Send invitation</SubmitButton>
      </div>
    </form>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [state, action] = useActionState(revokeInvitation, initial);
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
        Revoke
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
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{ROLE_LABELS[m.role]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pending.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Pending invitations</p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>{ROLE_LABELS[inv.role]}</TableCell>
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
          Only owners can invite teammates.
        </p>
      )}
    </div>
  );
}
