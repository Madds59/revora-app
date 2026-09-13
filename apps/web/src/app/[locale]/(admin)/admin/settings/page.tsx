import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminSettingsPage() {
  const user = await requireSuperAdmin();
  const t = await getTranslations("adminSettings");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("currentAdmin.title")}</CardTitle>
              <CardDescription>{t("currentAdmin.description")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="font-medium">{user.email}</div>
              <div className="text-muted-foreground text-xs">
                {t("currentAdmin.note")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("isolation.title")}</CardTitle>
              <CardDescription>{t("isolation.description")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("isolation.body")}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("surfaces.title")}</CardTitle>
              <CardDescription>{t("surfaces.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link href="/admin/admins" className={buttonVariants({ variant: "outline" })}>
                {t("surfaces.superAdmins")}
              </Link>
              <Link href="/admin/tenants" className={buttonVariants({ variant: "outline" })}>
                {t("surfaces.tenants")}
              </Link>
              <Link href="/admin/audit-logs" className={buttonVariants({ variant: "outline" })}>
                {t("surfaces.auditLogs")}
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("state.title")}</CardTitle>
            <CardDescription>{t("state.description")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("state.body")}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
