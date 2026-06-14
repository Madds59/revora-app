"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, signInWithMagicLink, type AuthState } from "../actions";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const initial: AuthState = {};

function FormMessage({ state }: { state: AuthState }) {
  if (state.error)
    return <p className="text-destructive text-sm">{state.error}</p>;
  if (state.message)
    return <p className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}

export default function LoginPage() {
  const [pwState, pwAction] = useActionState(signIn, initial);
  const [linkState, linkAction] = useActionState(signInWithMagicLink, initial);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your Revora workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="password">
          <TabsList className="w-full">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>

          <TabsContent value="password">
            <form action={pwAction} className="mt-4 flex flex-col gap-4">
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
                  required
                />
              </div>
              <FormMessage state={pwState} />
              <SubmitButton className="w-full">Sign in</SubmitButton>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form action={linkAction} className="mt-4 flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  name="email"
                  type="email"
                  required
                />
              </div>
              <FormMessage state={linkState} />
              <SubmitButton className="w-full" variant="secondary">
                Send magic link
              </SubmitButton>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="text-muted-foreground text-sm">
        No account?{" "}
        <Link href="/signup" className="text-foreground ms-1 underline">
          Create one
        </Link>
      </CardFooter>
    </Card>
  );
}
