"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { setSuperAdmin, type AdminFormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AdminFormState = {};

export function PromoteAdminForm() {
  const [state, action] = useActionState(setSuperAdmin, initial);
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
      <input type="hidden" name="make_admin" value="true" />
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="email">User email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="person@example.com"
          required
        />
        <p className="text-muted-foreground text-xs">
          The person must have signed up already.
        </p>
      </div>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>Grant super admin</SubmitButton>
      </div>
    </form>
  );
}

export function RevokeAdminButton({ email }: { email: string }) {
  const [state, action] = useActionState(setSuperAdmin, initial);
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
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="make_admin" value="false" />
      <SubmitButton variant="ghost" size="sm">
        Revoke
      </SubmitButton>
    </form>
  );
}
