"use client";

import { useActionState } from "react";

import { createBusiness, type OnboardingState } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: OnboardingState = {};

export function OnboardingForm({
  defaultName,
  email,
}: {
  defaultName: string;
  email: string;
}) {
  const [state, action] = useActionState(createBusiness, initial);

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Create your business</CardTitle>
        <CardDescription>
          Set up your workshop, service center, or operations team as the
          business owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Business name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Al Mansoori Auto Workshop"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="full_name">Your name</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={defaultName}
            />
            <p className="text-muted-foreground text-xs">
              Signed in as {email}
            </p>
          </div>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
          <SubmitButton className="w-full">
            Create business &amp; continue
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
