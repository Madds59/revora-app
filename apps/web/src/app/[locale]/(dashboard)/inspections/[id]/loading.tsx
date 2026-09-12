import { getTranslations } from "next-intl/server";

import { AppShellLoading } from "@/components/app-shell-loading";

export default async function Loading() {
  const t = await getTranslations("dashboardInspections");
  return <AppShellLoading title={t("title")} description={t("description")} />;
}
