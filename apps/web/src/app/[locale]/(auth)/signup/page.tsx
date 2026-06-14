"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { signUp, type AuthState } from "../actions";
import { AccountIntentPicker } from "@/components/account-intent-picker";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountIntent } from "@/lib/account-intent";

const initial: AuthState = {};

export default function SignupPage() {
  const [state, action] = useActionState(signUp, initial);
  const [accountIntent, setAccountIntent] = useState<AccountIntent | null>(
    null,
  );

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Choose the account type that fits how you will use Revora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-3">
            <AccountIntentPicker
              value={accountIntent}
              onChange={setAccountIntent}
            />
            <input type="hidden" name="account_intent" value={accountIntent ?? ""} />
            <p className="text-muted-foreground text-xs">
              Super admin is never selectable here. Staff access requires an invitation.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" type="text" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          {state.message && (
            <p className="text-sm text-emerald-600">{state.message}</p>
          )}
          <SubmitButton className="w-full" disabled={!accountIntent}>
            Create account
          </SubmitButton>
        </form>
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground ms-1 underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
