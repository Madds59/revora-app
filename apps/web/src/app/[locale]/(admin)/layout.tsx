import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin-nav";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { ShellAccountMenu } from "@/components/shell-account-menu";
import { requireSuperAdmin } from "@/lib/auth";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("adminTitle"),
    description: t("adminDescription"),
  };
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("shell");
  const user = await requireSuperAdmin();

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora Admin"
      brandSubtitle={t("platformConsole")}
      nav={<AdminNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Platform admin"}
            title={t("platformConsole")}
            subtitle={t("adminAccess")}
            footerNote={t("platformOwner")}
          />
        ) : undefined
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Platform admin"}
            title={t("platformConsole")}
            subtitle={user.email}
            footerNote={t("platformOwner")}
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
