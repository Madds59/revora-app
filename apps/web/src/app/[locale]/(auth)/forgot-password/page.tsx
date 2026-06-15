import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ForgotPasswordClient } from "./forgot-password-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("forgotPasswordTitle"),
    description: t("forgotPasswordDescription"),
  };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
