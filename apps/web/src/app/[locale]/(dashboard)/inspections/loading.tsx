import { getTranslations } from "next-intl/server";

import { AppShellLoading } from "@/components/app-shell-loading";

// Localized rather than hardcoded, unlike the older loading.tsx files: every DVI
// user-facing string comes from the next-intl catalogues, and a skeleton screen is
// still a user-facing string.
export default async function Loading() {
  const t = await getTranslations("dashboardInspections");
  return <AppShellLoading title={t("title")} description={t("description")} />;
}
