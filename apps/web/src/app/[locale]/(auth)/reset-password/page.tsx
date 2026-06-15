import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";

import { ResetPasswordClient } from "./reset-password-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("resetPasswordTitle"),
    description: t("resetPasswordDescription"),
  };
}

export default async function ResetPasswordPage() {
  await requireUser();
  return <ResetPasswordClient />;
}
