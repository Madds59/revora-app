import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SignupClient } from "./signup-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("signupTitle"),
    description: t("signupDescription"),
  };
}

export default function SignupPage() {
  return <SignupClient />;
}
