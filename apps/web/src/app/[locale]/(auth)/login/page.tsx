import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginClient } from "./login-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("loginTitle"),
    description: t("loginDescription"),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reset?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  return <LoginClient passwordResetSuccess={params?.reset === "success"} />;
}
