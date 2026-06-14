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

export default function LoginPage() {
  return <LoginClient />;
}
